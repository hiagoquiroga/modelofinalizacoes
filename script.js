// ========================================
// CONFIGURAÇÕES E CONSTANTES
// ========================================

const mediasHistoricas = {
    mediaFinalizacoes: 3.5,
    mediaFormaRecente: 3.0,
    finalizacoesSofridas: 12.0,     // Média de finalizações sofridas em uma liga típica
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
    // 3. QUALIDADE DO ADVERSÁRIO (PESO AUMENTADO 15% → 25%)
    // ============================================================
    // Defensivas fracas (mais finalizações sofridas) = mais oportunidades para o jogador
    // Fator > 1.0 indica adversário fraco (sofre mais chutes que a média)
    // Fator < 1.0 indica adversário forte (sofre menos chutes que a média)
    const fatorAdversario = inputs.finalizacoesSofridasAdversario / mediasHistoricas.finalizacoesSofridas;

    // Ajuste mais agressivo com peso aumentado
    const ajusteAdversario = (fatorAdversario - 1.0) * pesos.qualidadeAdversario * lambda;
    lambda += ajusteAdversario;

    // ============================================================
    // 4. AJUSTE DE ESTILO DE JOGO (multiplicativo)
    // ============================================================
    lambda *= multiplicadorEstilo[estilo];

    // ============================================================
    // 5. FATOR DE MINUTOS E VOLUME DE PARTIDAS (CONFIANÇA COMBINADA)
    // ============================================================
    // LÓGICA: Mais minutos/partida + Mais partidas = Maior confiança
    // IMPORTANTE: 'minutos' JÁ É A MÉDIA DE MINUTOS POR PARTIDA (do input do HTML)

    // A) FATOR DE MÉDIA DE MINUTOS (interpolação linear 0.2 a 1.0)
    // Quanto mais perto de 90 minutos, maior o peso
    // Fórmula: 0.2 + (min/90) * 0.8
    const fatorMinutos = Math.min(1.0, 0.2 + (minutos / 90) * 0.8);

    // Exemplos:
    // 0 min   → 0.20
    // 30 min  → 0.47
    // 45 min  → 0.60
    // 60 min  → 0.73
    // 75 min  → 0.87
    // 90+ min → 1.00

    // B) FATOR DE VOLUME DE PARTIDAS (interpolação linear 0.3 a 1.0)
    // Mais partidas = mais confiança estatística
    // Fórmula: 0.3 + ((partidas-1)/14) * 0.7
    const fatorVolume = Math.min(1.0, 0.3 + ((partidas - 1) / 14) * 0.7);

    // Exemplos:
    // 1 partida  → 0.30
    // 3 partidas → 0.40
    // 5 partidas → 0.50
    // 8 partidas → 0.65
    // 12 partidas → 0.85
    // 15+ partidas → 1.00

    // C) AJUSTE DE CONFIANÇA BASEADO EM MINUTOS E PARTIDAS
    // Combina os dois fatores em um multiplicador de confiança (0.3 a 1.5)
    // Range mais agressivo para impacto visível

    const pesoMinutosEPartidas = fatorMinutos * fatorVolume;

    // Interpolar o peso (0 a 1) para um multiplicador de confiança (0.3 a 1.5)
    // Peso mínimo (0.2*0.3=0.06) → Multiplicador 0.37 (penalidade BRUTAL)
    // Peso baixo (0.4*0.5=0.20) → Multiplicador 0.54 (penalidade forte)
    // Peso médio (0.7*0.7=0.49) → Multiplicador 0.89 (penalidade moderada)
    // Peso alto (1.0*1.0=1.00) → Multiplicador 1.50 (bônus forte)
    const multiplicadorConfianca = 0.30 + (pesoMinutosEPartidas * 1.20);
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
            finalizacoesSofridasAdversario: parseFloat(document.getElementById('finalizacoesSofridasAdversario').value)
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

        // Atualizar interface
        const resultadoDiv = document.getElementById('resultado');
        resultadoDiv.innerHTML = `
            <div class="probabilidade-principal">
                Probabilidade: <span id="probValue">${(prob * 100).toFixed(2)}%</span>
            </div>
            <div class="odd-justa">
                Odd justa: <span id="oddValue">${odd}</span>
            </div>
            <div class="intervalo-confianca">
                Intervalo de confiança (95%): <span id="intervalo">${intervalo.min} - ${intervalo.max} finalizações</span>
            </div>
            <div class="alerta-qualidade ${qualidade.classe}" style="background-color: ${qualidade.cor}22; color: ${qualidade.cor};">
                ${qualidade.mensagem}
            </div>
        `;

    } catch (error) {
        alert("❌ Erro ao calcular: " + error.message);
        console.error(error);
    }
}