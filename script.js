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

// Multiplicadores por mando de campo
const multiplicadorMando = {
    casa: 1.05,
    fora: 0.95
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

function expectativaFinalizacoes(inputs, posicao, estilo, mando, minutos, partidas) {
    // MODELO MULTIPLICATIVO PURO (Correção de odds e bônus reais)

    // 1. BASE UNITÁRIA (Média ponderada entre Histórico e Forma)
    // Peso Histórico: 40% | Peso Forma: 20%
    // Normalizamos para extrair a tendência real do jogador
    let lambda = (inputs.mediaFinalizacoes * 0.40 + inputs.mediaFormaRecente * 0.20) / 0.60;

    // 2. MULTIPLICADOR DE POSIÇÃO (Impacto Direto)
    lambda *= multiplicadorPosicao[posicao];

    // 3. MULTIPLICADOR DE ESTILO (Impacto Direto)
    lambda *= multiplicadorEstilo[estilo];

    // 4. MULTIPLICADOR DE MANDO (Casa/Fora)
    lambda *= multiplicadorMando[mando];

    // 5. CONTEXTO DEFENSIVO (Diferencial de finalizações sofridas)
    // Ratio: O que o adversário sofre vs o que a equipe faz
    const ratioDefensivo = inputs.finalizacoesSofridasAdversario / inputs.finalizacoesEquipe;
    // Bônus de até 35% do diferencial (range controlado)
    const multiplicadorDefensivo = 1 + (ratioDefensivo - 1.0) * 0.35;
    lambda *= multiplicadorDefensivo;

    // 6. FATOR DE MINUTOS (Range conservador para não derreter as odds)
    // Minutos agora apenas ajustam levemente para baixo se o jogador joga pouco
    const fatorMinutos = 0.85 + (minutos / 90) * 0.15;
    lambda *= Math.min(1.0, fatorMinutos);

    // 7. FATOR DE VOLUME / CONFIANÇA (0.90 a 1.10)
    // Resolve o bug de odds baixas. A confiança não infla o lambda, apenas valida.
    let fatorVolume;
    if (partidas >= 20) {
        fatorVolume = 1.0;
    } else if (partidas >= 10) {
        fatorVolume = 0.88 + ((partidas - 10) / 10) * 0.12;
    } else if (partidas >= 5) {
        fatorVolume = 0.65 + ((partidas - 5) / 5) * 0.23;
    } else {
        fatorVolume = ((partidas - 1) / 4) * 0.65;
    }

    // Traduz o volume para um multiplicador de 0.90 a 1.10
    const multiplicadorConfianca = 0.90 + (fatorVolume * 0.20);
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

const multiplicadorEstilo = {
    ofensivo_intenso: 1.12,
    equilibrado: 1.00,
    defensivo: 0.88
};

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
        const mando = document.getElementById('mandoCampo').value;
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

        // Calcular lambda (expectativa de finalizações) - NOVO MODELO SEQUENCIAL
        const lambda = expectativaFinalizacoes(inputs, posicao, estilo, mando, minutos, partidas);

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