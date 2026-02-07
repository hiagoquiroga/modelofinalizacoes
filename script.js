// ========================================
// CONFIGURAÇÕES E CONSTANTES
// ========================================

const mediasHistoricas = {
    mediaFinalizacoes: 3.5,
    mediaFormaRecente: 3.0,
    finalizacoesSofridas: 12.0,     // Média de finalizações sofridas em uma liga típica
    finalizacoesEquipe: 12.0,       // Média de finalizações feitas pela equipe em uma liga típica
    minutosMediaPorPartida: 70      // Média esperada de minutos por partida
};

// Pesos recalibrados - Modelo Aprimorado (total = 100%)
// AJUSTE PRINCIPAL: Aumentado peso do adversário de 15% → 25%
const pesos = {
    mediaFinalizacoes: 0.40,         // 40% - Baseline histórico (reduzido de 48%)
    mediaFormaRecente: 0.18,         // 18% - Forma recente (reduzido de 20%)
    posicao: 0.10,                   // 10% - Posição do jogador
    qualidadeAdversario: 0.25,       // 25% - Qualidade do adversário (AUMENTADO de 15%)
    estiloJogo: 0.07                 // 7%  - Estilo de jogo
};

// Multiplicadores por posição do jogador (ajustados para modelo híbrido direto)
const multiplicadorPosicao = {
    atacante: 1.15,
    ponta: 1.12,
    meia_ofensivo: 1.08,
    meia_central: 0.75,
    volante: 0.65,
    lateral: 0.50,
    zagueiro: 0.45
};

// Multiplicadores por estilo de jogo da equipe (ajustados)
const multiplicadorEstilo = {
    ofensivo_intenso: 1.12,
    equilibrado: 1.00,
    defensivo: 0.88
};

// ========================================
// FUNÇÕES MATEMÁTICAS
// ========================================

// Função Poisson para P(X >= linha)
function poissonProb(lambda, linha) {
    let sum = 0;
    for (let k = 0; k < linha; k++) {
        sum += Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
    }
    return 1 - sum;
}

// Fatorial
function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
}

// ========================================
// VALIDAÇÃO DE INPUTS
// ========================================

function validarInputs(inputs, minutos, partidas, linha) {
    const erros = [];

    if (isNaN(inputs.mediaFinalizacoes) || inputs.mediaFinalizacoes < 0 || inputs.mediaFinalizacoes > 12) {
        erros.push("Média de finalizações deve estar entre 0 e 12");
    }

    if (isNaN(inputs.mediaFormaRecente) || inputs.mediaFormaRecente < 0 || inputs.mediaFormaRecente > 12) {
        erros.push("Forma recente deve estar entre 0 e 12");
    }

    if (isNaN(inputs.finalizacoesSofridasAdversario) || inputs.finalizacoesSofridasAdversario < 1 || inputs.finalizacoesSofridasAdversario > 30) {
        erros.push("Finalizações sofridas pelo adversário deve estar entre 1 e 30");
    }

    if (isNaN(inputs.finalizacoesEquipe) || inputs.finalizacoesEquipe < 1 || inputs.finalizacoesEquipe > 30) {
        erros.push("Finalizações da equipe deve estar entre 1 e 30");
    }

    if (isNaN(minutos) || minutos < 1 || minutos > 120) {
        erros.push("Minutos deve estar entre 1 e 120");
    }

    if (isNaN(partidas) || partidas < 1 || partidas > 50) {
        erros.push("Partidas jogadas deve estar entre 1 e 50");
    }

    if (isNaN(linha) || linha < 0 || linha > 15) {
        erros.push("Linha da aposta deve estar entre 0 e 15");
    }

    return erros;
}

// ========================================
// CÁLCULO DA EXPECTATIVA (LAMBDA)
// ========================================

function expectativaFinalizacoes(inputs, posicao, estilo, minutos, partidas) {
    // MODELO APRIMORADO: Considera relação minutos x partidas x volume de chutes

    // Base: começa com a média histórica de finalizações
    let lambda = inputs.mediaFinalizacoes;

    // ============================================================
    // 1. AJUSTE DE FORMA RECENTE (ponderado diferencial)
    // ============================================================
    const diferencaForma = inputs.mediaFormaRecente - inputs.mediaFinalizacoes;
    const pesoRelativoForma = pesos.mediaFormaRecente / pesos.mediaFinalizacoes;
    lambda += (diferencaForma * pesoRelativoForma);

    // ============================================================
    // 2. AJUSTE DE POSIÇÃO (multiplicativo)
    // ============================================================
    const ajustePosicao = lambda * (multiplicadorPosicao[posicao] - 1.0) * pesos.posicao;
    lambda += ajustePosicao;

    // ============================================================
    // 3. CONTEXTO OFENSIVO (INVERSO - FORÇA DEFENSIVA DO ADVERSÁRIO)
    // ============================================================
    // Compara o que o adversário SOFRE vs o que a equipe normalmente FAZ
    // Lógica: Se adversário sofre MENOS que a equipe faz = defesa FORTE = desfavorável
    //         Se adversário sofre MAIS que a equipe faz = defesa FRACA = favorável

    // Ratio defensivo: quanto o adversário sofre em relação ao que a equipe faz
    const ratioDefensivo = inputs.finalizacoesSofridasAdversario / inputs.finalizacoesEquipe;

    // Exemplos:
    // - Equipe faz 15, Adversário sofre 10 → ratio = 0.67 (defesa forte, -33%)
    // - Equipe faz 10, Adversário sofre 15 → ratio = 1.50 (defesa fraca, +50%)
    // - Equipe faz 12, Adversário sofre 12 → ratio = 1.00 (neutro)

    // Ajustar lambda baseado no ratio defensivo
    // ratio > 1.0 = adversário sofre mais (defesa fraca) → AUMENTA probabilidade
    // ratio < 1.0 = adversário sofre menos (defesa forte) → DIMINUI probabilidade
    const ajusteContexto = (ratioDefensivo - 1.0) * pesos.qualidadeAdversario * lambda;
    lambda += ajusteContexto;

    // ============================================================
    // 4. AJUSTE DE ESTILO DE JOGO (multiplicativo)
    // ============================================================
    lambda *= multiplicadorEstilo[estilo];

    // ============================================================
    // 5. FATOR DE MINUTOS E VOLUME DE PARTIDAS (CONFIANÇA COMBINADA)
    // ============================================================
    // LÓGICA: Mais minutos/partida + Mais partidas = Maior confiança
    // IMPORTANTE: 'minutos' JÁ É A MÉDIA DE MINUTOS POR PARTIDA (do input do HTML)

    // A) FATOR DE MÉDIA DE MINUTOS (interpolação conservadora 0.7 a 1.0)
    // Quanto mais perto de 90 minutos, maior o peso
    // Fórmula: 0.7 + (min/90) * 0.3
    const fatorMinutos = Math.min(1.0, 0.7 + (minutos / 90) * 0.3);

    // Exemplos (impacto reduzido):
    // 0 min   → 0.70
    // 30 min  → 0.80
    // 45 min  → 0.85
    // 60 min  → 0.90
    // 75 min  → 0.95
    // 90+ min → 1.00

    // B) FATOR DE VOLUME DE PARTIDAS (curva logarítmica suavizada com cap em 20)
    // Mais partidas = mais confiança estatística
    // Usa log para crescer até 20 partidas, depois estabiliza
    // Fórmula: 0.80 + (log(partidas) / log(20)) * 0.20
    const fatorVolume = partidas >= 20
        ? 1.0
        : Math.min(1.0, 0.80 + (Math.log(partidas) / Math.log(20)) * 0.20);

    // Exemplos (gap MÍNIMO entre partidas, crescimento até 20):
    // 1 partida  → 0.80
    // 2 partidas → 0.85 (+5%)
    // 3 partidas → 0.88 (+3%)
    // 5 partidas → 0.91 (+3%)
    // 10 partidas → 0.96 (+5%)
    // 20 partidas → 1.00 (+4%)
    // 30+ partidas → 1.00 (cap fixo)

    // C) AJUSTE DE CONFIANÇA BASEADO EM MINUTOS E PARTIDAS
    // Combina os dois fatores em um multiplicador de confiança (0.75 a 1.50)
    // Range otimizado: gap pequeno entre poucas partidas, bônus forte para 20+

    const pesoMinutosEPartidas = fatorMinutos * fatorVolume;

    // Interpolar o peso para um multiplicador de confiança (0.75 a 1.50)
    // Peso mínimo (0.70*0.80=0.56) → Multiplicador 0.75 (penalidade leve)
    // Peso baixo (0.80*0.85=0.68) → Multiplicador 0.86 (penalidade mínima)
    // Peso médio (0.90*0.91=0.82) → Multiplicador 0.99 (quase neutro)
    // Peso alto (1.0*1.0=1.00) → Multiplicador 1.50 (bônus forte para 20+ partidas)
    const multiplicadorConfianca = 0.75 + (pesoMinutosEPartidas * 0.75);
    lambda *= multiplicadorConfianca;

    // Garantir valor mínimo positivo
    return Math.max(0.01, lambda);
}

// ========================================
// SISTEMA DE ALERTAS DE QUALIDADE
// ========================================

function avaliarQualidadePredicao(partidas, minutos) {
    // Sistema de alerta baseado APENAS no número de partidas (tamanho da amostra)

    if (partidas < 3) {
        return {
            nivel: 'BAIXA',
            cor: '#ff4444',
            mensagem: `⚠️ Poucos jogos (${partidas}) - Use com muito cuidado`,
            classe: 'alerta-baixa'
        };
    }

    if (partidas < 7) {
        return {
            nivel: 'MÉDIA',
            cor: '#ffaa00',
            mensagem: `⚡ Amostra razoável (${partidas} jogos) - Risco moderado`,
            classe: 'alerta-media'
        };
    }

    return {
        nivel: 'ALTA',
        cor: '#00ff88',
        mensagem: `✅ Boa amostra (${partidas} jogos) - Dados confiáveis`,
        classe: 'alerta-alta'
    };
}

// ========================================
// INTERVALO DE CONFIANÇA
// ========================================

function calcularIntervaloConfianca(lambda, partidas) {
    // Confiança baseada em partidas (0 a 1)
    const confianca = Math.min(partidas / 10, 1);

    // Desvio padrão ajustado pela confiança
    const desvio = Math.sqrt(lambda) * (1.5 - confianca * 0.5);

    // Intervalo de 95% de confiança (z = 1.96)
    return {
        min: Math.max(0, lambda - 1.96 * desvio).toFixed(2),
        max: (lambda + 1.96 * desvio).toFixed(2)
    };
}

// ========================================
// CÁLCULO DE ODD JUSTA
// ========================================

function oddJusta(probabilidade) {
    if (probabilidade === 0) return "∞";
    return (1 / probabilidade).toFixed(2);
}

// ========================================
// FUNÇÃO PRINCIPAL DE CÁLCULO
// ========================================

function calcular() {
    try {
        // Capturar inputs
        const inputs = {
            mediaFinalizacoes: parseFloat(document.getElementById('mediaFinalizacoes').value),
            mediaFormaRecente: parseFloat(document.getElementById('mediaFormaRecente').value),
            finalizacoesSofridasAdversario: parseFloat(document.getElementById('finalizacoesSofridasAdversario').value),
            finalizacoesEquipe: parseFloat(document.getElementById('finalizacoesEquipe').value)
        };

        const posicao = document.getElementById('posicaoJogador').value;
        const estilo = document.getElementById('estiloJogo').value;
        const linha = parseFloat(document.getElementById('linhaAposta').value);
        const minutos = parseFloat(document.getElementById('minutosPartida').value);
        const partidas = parseFloat(document.getElementById('partidasJogadas').value);

        // Validar inputs
        const erros = validarInputs(inputs, minutos, partidas, linha);
        if (erros.length > 0) {
            alert("❌ Erros nos dados:\n\n" + erros.join("\n"));
            return;
        }

        // Calcular lambda (expectativa de finalizações) - MODELO SIMPLIFICADO
        const lambda = expectativaFinalizacoes(inputs, posicao, estilo, minutos, partidas);

        // Calcular probabilidade usando Poisson
        const prob = poissonProb(lambda, Math.ceil(linha));
        const odd = oddJusta(prob);

        // Calcular intervalo de confiança
        const intervalo = calcularIntervaloConfianca(lambda, partidas);

        // Avaliar qualidade da predição
        const qualidade = avaliarQualidadePredicao(partidas, minutos);

        // Atualizar interface com design premium
        const resultadoDiv = document.getElementById('resultado');

        // Determine quality alert class
        let qualityClass = 'high';
        let qualityIcon = '✅';
        if (qualidade.nivel === 'MÉDIA') {
            qualityClass = 'medium';
            qualityIcon = '⚡';
        } else if (qualidade.nivel === 'BAIXA') {
            qualityClass = 'low';
            qualityIcon = '⚠️';
        }

        resultadoDiv.innerHTML = `
            <div class="probability-main">
                <div class="label">Probabilidade de Sucesso</div>
                <div class="value">${(prob * 100).toFixed(2)}%</div>
                <div class="description">Chance de atingir ${linha}+ finalizações</div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="label">Odd Justa</div>
                    <div class="value">${odd}</div>
                </div>
                <div class="stat-box">
                    <div class="label">Expectativa (λ)</div>
                    <div class="value">${lambda.toFixed(2)}</div>
                </div>
            </div>
            
            <div class="confidence-range">
                <div class="label">Intervalo de Confiança (95%)</div>
                <div class="value">${intervalo.min} - ${intervalo.max} finalizações</div>
            </div>
            
            <div class="quality-alert ${qualityClass}">
                <span>${qualityIcon}</span>
                <span>${qualidade.mensagem}</span>
            </div>
        `;

    } catch (error) {
        alert("❌ Erro ao calcular: " + error.message);
        console.error(error);
    }
}