/**
 * Study Tracker - Core Application
 */

const state = {
    disciplinas: JSON.parse(localStorage.getItem('st_disciplinas')) || [],
    currentDisciplinaId: null
};

let flatSearchIndex = [];
const PALETA_CORES = ['#2f81f7', '#347d39', '#f28749', '#76e150', '#bc8cff', '#ff7b72', '#f6e05e'];
// Controllers de drag da árvore — cancelados e recriados a cada renderTree()
// para evitar acúmulo de listeners nos .tree-children (recriados a cada render)
let treeDragControllers = [];

// Retorna YYYY-MM-DD com base no horário local
function getLocalYYYYMMDD(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Formata para DD/MM/YYYY
function formatBRDate(dateStr) {
    if(!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    initDisciplinas();
    initAssuntos();
    initImportador();
    initMaisOpcoes();
    initBackupRestore();
    initSearchEngine();
    initMenuAcoes();
    initModalTexto();
    initPWA();
    initDashboardEmptyState();
    updateDashboard();
});

/**
 * TOAST — feedback rápido e não bloqueante. Usado no lugar de alert() e
 * confirm(): ações destrutivas acontecem na hora, mas com um botão
 * "Desfazer" por alguns segundos, em vez de interromper o usuário com um
 * diálogo nativo ANTES da ação.
 */
function mostrarToast(mensagem, { acaoLabel, onAcao, duracao = 4000, perigo = false } = {}) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast' + (perigo ? ' perigo' : '');

    const msgEl = document.createElement('span');
    msgEl.className = 'toast-message';
    msgEl.textContent = mensagem;
    toast.appendChild(msgEl);

    let fechado = false;
    const fechar = () => {
        if (fechado) return;
        fechado = true;
        toast.classList.add('saindo');
        setTimeout(() => toast.remove(), 200);
    };

    if (acaoLabel && onAcao) {
        const btnAcao = document.createElement('button');
        btnAcao.type = 'button';
        btnAcao.className = 'toast-action';
        btnAcao.textContent = acaoLabel;
        btnAcao.addEventListener('click', () => {
            fechar();
            onAcao();
        });
        toast.appendChild(btnAcao);
    }

    container.appendChild(toast);
    setTimeout(fechar, duracao);
}

/**
 * MODAL DE TEXTO — substitui window.prompt(). Diferente do prompt nativo,
 * respeita o tema do app e (crucial no iOS) exibe corretamente o valor
 * inicial quando editando algo existente.
 */
function abrirModalTexto({ titulo, valorInicial = '', placeholder = '', labelBotao = 'Salvar' }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-texto');
        const tituloEl = document.getElementById('modal-texto-titulo');
        const form = document.getElementById('form-texto');
        const input = document.getElementById('modal-texto-input');
        const btnSubmit = form.querySelector('button[type="submit"]');
        const btnCancelar = modal.querySelector('.modal-texto-cancelar');
        const btnClose = modal.querySelector('.modal-texto-close');

        tituloEl.textContent = titulo;
        input.value = valorInicial;
        input.placeholder = placeholder;
        btnSubmit.textContent = labelBotao;
        modal.classList.add('active');
        input.focus();
        input.select();

        let resolvido = false;
        const finalizar = (valor) => {
            if (resolvido) return;
            resolvido = true;
            modal.classList.remove('active');
            form.removeEventListener('submit', onSubmit);
            btnCancelar.removeEventListener('click', onCancelar);
            btnClose.removeEventListener('click', onCancelar);
            resolve(valor);
        };

        const onSubmit = (e) => {
            e.preventDefault();
            const valor = input.value.trim();
            if (!valor) return;
            finalizar(valor);
        };
        const onCancelar = () => finalizar(null);

        form.addEventListener('submit', onSubmit);
        btnCancelar.addEventListener('click', onCancelar);
        btnClose.addEventListener('click', onCancelar);
    });
}

function initModalTexto() {
    // Nada a inicializar globalmente: os listeners são criados e removidos
    // a cada chamada de abrirModalTexto() para suportar chamadas concorrentes
    // com segurança. Mantido como função só para ficar junto dos outros init*.
}

// Dica única sobre o gesto de toque longo, mostrada na primeira vez que o
// usuário abre uma disciplina (é onde os itens com toque longo aparecem).
function mostrarDicaToqueLongoUmaVez() {
    if (localStorage.getItem('st_dica_toque_longo')) return;
    localStorage.setItem('st_dica_toque_longo', '1');
    mostrarToast('Dica: toque e segure em um item para editar, excluir ou adicionar sub-assunto', { duracao: 6000 });
}

/**
 * PWA - Service Worker, instalação e funcionamento offline
 */
function initPWA() {
    registerServiceWorker();
    setupInstallPrompt();
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch((err) => console.warn('Falha ao registrar o service worker:', err));
    });
}

function setupInstallPrompt() {
    const btnInstall = document.getElementById('btn-install-pwa');
    if (!btnInstall) return;

    let deferredPrompt = null;

    // Já rodando como app instalado (standalone) -> não mostra o botão
    const jaInstalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (jaInstalado) return;

    // O navegador sinaliza que o app pode ser instalado
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        btnInstall.classList.remove('hidden');
    });

    btnInstall.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        btnInstall.disabled = true;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        btnInstall.classList.add('hidden');
        btnInstall.disabled = false;
    });

    // Depois de instalado, esconde o botão
    window.addEventListener('appinstalled', () => {
        btnInstall.classList.add('hidden');
        deferredPrompt = null;
    });
}

function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        const statsView = document.getElementById('estatisticas-view');
        if (statsView && statsView.classList.contains('active')) renderEstatisticas();
    });
}

// Aplica a troca visual de aba (nav ativa + seção visível) e dispara o
// carregamento de dados daquela aba. Usada tanto pelo clique manual na nav
// quanto pela navegação programática (botão "voltar" do navegador/celular).
function ativarAba(targetView) {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.view-section');

    // Trocar de aba sempre sai do "modo detalhe de disciplina" — mesmo que o
    // usuário tenha ido direto pra outra aba sem clicar em "Voltar". Sem
    // isso, o estado ficava dizendo que uma disciplina ainda estava aberta
    // mesmo com outra aba na tela, e o botão voltar acabava te mandando pro
    // lugar errado.
    state.currentDisciplinaId = null;

    // Ao sair da aba de Disciplinas, limpa a busca — sem isso, um termo
    // buscado e não usado (ou usado e já visitado) ficava esperando na
    // caixa quando o usuário voltava, como se ainda estivesse "em uso".
    if (targetView !== 'disciplinas') {
        const searchInput = document.getElementById('global-search');
        const searchResults = document.getElementById('search-results');
        if (searchInput) searchInput.value = '';
        if (searchResults) { searchResults.classList.add('hidden'); searchResults.innerHTML = ''; }
    }

    navLinks.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-target') === targetView));
    sections.forEach(section => section.classList.toggle('active', section.id === `${targetView}-view`));

    if (targetView === 'disciplinas') showDisciplinasMainList();
    if (targetView === 'dashboard') updateDashboard();
    if (targetView === 'calendario') renderHeatmap();
    if (targetView === 'estatisticas') renderEstatisticas();
}

/**
 * BOTÃO VOLTAR (histórico do navegador / botão físico do celular)
 *
 * Modelo de profundidade:
 *   nível 0 = Dashboard
 *   nível 1 = qualquer outra aba (Disciplinas, Calendário, Estatísticas)
 *   nível 2 = dentro do detalhe de uma disciplina
 *
 * Importante: só empilhamos entradas no histórico em resposta direta a um
 * clique/toque do usuário (subirNivel/irParaNivel), NUNCA de dentro do
 * handler de popstate. Isso evita inconsistências com o gesto de "voltar
 * preditivo" do Android, que precisa que a entrada já exista de antemão —
 * criá-la só depois que o popstate já disparou pode chegar tarde demais
 * pro próximo gesto de voltar.
 */
let nivelHistorico = 0;
let ignorarProximoPopstate = false;

function subirNivel() {
    nivelHistorico++;
    history.pushState({ nivel: nivelHistorico }, '', location.href);
}

function irParaNivel(alvo) {
    if (nivelHistorico < alvo) {
        while (nivelHistorico < alvo) subirNivel();
    } else if (nivelHistorico > alvo) {
        ignorarProximoPopstate = true;
        const passos = nivelHistorico - alvo;
        nivelHistorico = alvo;
        history.go(-passos);
    }
}

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetView = e.currentTarget.getAttribute('data-target');
            ativarAba(targetView);
            irParaNivel(targetView === 'dashboard' ? 0 : 1);
        });
    });

    window.addEventListener('popstate', () => {
        if (ignorarProximoPopstate) {
            ignorarProximoPopstate = false;
            return;
        }

        // Um popstate real do usuário sempre desce exatamente 1 nível
        nivelHistorico = Math.max(0, nivelHistorico - 1);

        // Dentro de uma disciplina -> volta pra lista de disciplinas (nível 1)
        if (state.currentDisciplinaId) {
            ativarAba('disciplinas');
        } else if (nivelHistorico === 0) {
            // Em qualquer aba que não seja o Dashboard -> volta pro Dashboard
            ativarAba('dashboard');
        }
        // Se já estava numa aba não-dashboard sem disciplina aberta, não faz
        // nada: a tela já está correta, e o próximo "voltar" desce pro Dashboard.
    });

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const statsView = document.getElementById('estatisticas-view');
            if (statsView && statsView.classList.contains('active')) renderEstatisticas();
        }, 200);
    });
}

/**
 * HEATMAP E CALENDÁRIO
 */
function getContributions() {
    const history = {};
    state.disciplinas.forEach(d => {
        const traverse = (items) => {
            items.forEach(item => {
                if (!item.filhos || item.filhos.length === 0) {
                    if (item.concluido && item.dataConclusao) {
                        if (!history[item.dataConclusao]) history[item.dataConclusao] = [];
                        history[item.dataConclusao].push({ disciplina: d.nome, titulo: item.titulo, cor: d.cor });
                    }
                } else {
                    traverse(item.filhos);
                }
            });
        };
        traverse(d.assuntos);
    });
    return history;
}

function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    const grid = document.getElementById('heatmap-grid');
    if (!container || !grid) return;

    const history = getContributions();
    const today = new Date();
    
    // Calcula 365 dias atrás (ajustando para o último domingo)
    const startDate = new Date();
    startDate.setFullYear(today.getFullYear() - 1);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let html = '';
    let currentDate = new Date(startDate);
    let totalSemanas = 0;

    while (currentDate <= today) {
        const dateStr = getLocalYYYYMMDD(currentDate);
        const itensDia = history[dateStr] || [];
        const count = itensDia.length;
        
        let level = 0;
        if (count > 0) level = 1;
        if (count >= 3) level = 2;
        if (count >= 6) level = 3;
        if (count >= 10) level = 4;

        html += `<div class="heatmap-cell" data-level="${level}" data-date="${dateStr}" title="${count} assunto(s) em ${formatBRDate(dateStr)}"></div>`;
        if (currentDate.getDay() === 0) totalSemanas++;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    grid.innerHTML = html;
    renderHeatmapMeses(startDate, totalSemanas);

    // Rola para o final da grid (foco no hoje)
    container.scrollLeft = container.scrollWidth;

    // Adiciona interatividade nos quadrados
    grid.querySelectorAll('.heatmap-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            grid.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
            
            const dateStr = e.target.getAttribute('data-date');
            showCalendarioDetails(dateStr, history[dateStr] || []);
        });
    });
}

// Desenha os rótulos de mês acima do heatmap, alinhados coluna a coluna
// (cada coluna = uma semana), no estilo do calendário de contribuições
// do GitHub — sem isso, era difícil saber a qual período cada trecho
// da grade correspondia.
function renderHeatmapMeses(startDate, totalSemanas) {
    const container = document.getElementById('heatmap-months');
    if (!container) return;

    let html = '';
    let mesAnterior = null;

    for (let semana = 0; semana < totalSemanas; semana++) {
        const dataSemana = new Date(startDate);
        dataSemana.setDate(dataSemana.getDate() + semana * 7);
        const mesAtual = dataSemana.getMonth();

        if (mesAtual !== mesAnterior) {
            let label = dataSemana.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
            label = label.charAt(0).toUpperCase() + label.slice(1);
            html += `<div class="heatmap-month-label">${label}</div>`;
            mesAnterior = mesAtual;
        } else {
            html += '<div></div>';
        }
    }

    container.innerHTML = html;
}

function showCalendarioDetails(dateStr, items) {
    const card = document.getElementById('calendario-details-card');
    const title = document.getElementById('cal-details-date');
    const subtitle = document.getElementById('cal-details-count');
    const list = document.getElementById('cal-details-list');

    card.classList.remove('hidden');
    title.textContent = formatBRDate(dateStr);
    
    if (items.length === 0) {
        subtitle.textContent = "Nenhum estudo registrado neste dia.";
        list.innerHTML = "";
        return;
    }

    subtitle.textContent = `${items.length} assunto(s) concluído(s)`;
    
    list.innerHTML = items.map(item => `
        <li class="cal-details-item">
            <span class="cal-details-badge" style="background-color: ${item.cor}20; color: ${item.cor}; border: 1px solid ${item.cor}40">
                ${escapeHTML(item.disciplina)}
            </span>
            <span style="font-size: 0.875rem;">${escapeHTML(item.titulo)}</span>
        </li>
    `).join('');
}

/**
 * ESTATÍSTICAS
 */
function getCSSVar(nome) {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

// Ajusta o canvas para telas de alta densidade (Retina) e retorna o contexto pronto para uso
function setupCanvasHiDPI(canvas, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    // Descontamos o padding horizontal do card pai: clientWidth inclui o padding,
    // e se não descontarmos, o canvas fica mais largo que a área de conteúdo
    // disponível e "vaza" para fora do card.
    const estilosPai = getComputedStyle(parent);
    const paddingHorizontal = parseFloat(estilosPai.paddingLeft || 0) + parseFloat(estilosPai.paddingRight || 0);
    const cssWidth = Math.max(parent.clientWidth - paddingHorizontal, 0);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.max(Math.round(cssWidth * dpr), 1);
    canvas.height = Math.max(Math.round(cssHeight * dpr), 1);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: cssWidth, height: cssHeight };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    const raio = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.arcTo(x + w, y, x + w, y + h, raio);
    ctx.arcTo(x + w, y + h, x, y + h, raio);
    ctx.arcTo(x, y + h, x, y, raio);
    ctx.arcTo(x, y, x + w, y, raio);
    ctx.closePath();
}

function drawRoundedRectTop(ctx, x, y, w, h, r) {
    if (h <= 0 || w <= 0) return;
    const raio = Math.min(r, h, w / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + raio);
    ctx.quadraticCurveTo(x, y, x + raio, y);
    ctx.lineTo(x + w - raio, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + raio);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
}

// Gráfico de rosca (donut) simples para o percentual geral
function drawDonutChart(canvasId, percentual, cor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrapper = canvas.parentElement;
    // O tamanho segue o wrapper (que encolhe em telas estreitas via max-width),
    // limitado a 160px, evitando que o canvas fique maior que a área disponível.
    const size = Math.max(Math.min(wrapper.clientWidth || 160, 160), 40);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, raio = size / 2 - 12;
    const inicioAngulo = -Math.PI / 2;
    const fimAngulo = inicioAngulo + (Math.PI * 2 * (percentual / 100));

    ctx.lineWidth = 14;
    ctx.lineCap = 'round';

    ctx.strokeStyle = getCSSVar('--border-default');
    ctx.beginPath();
    ctx.arc(cx, cy, raio, 0, Math.PI * 2);
    ctx.stroke();

    if (percentual > 0) {
        ctx.strokeStyle = cor;
        ctx.beginPath();
        ctx.arc(cx, cy, raio, inicioAngulo, fimAngulo);
        ctx.stroke();
    }
}

// Gráfico de barras verticais (usado nos gráficos mensal e semanal)
function drawBarChart(canvasId, itens, { height = 220, suffix = '' } = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, width } = setupCanvasHiDPI(canvas, height);
    ctx.clearRect(0, 0, width, height);
    if (itens.length === 0) return;

    const valorMaximo = Math.max(...itens.map(i => i.value), 1);
    const paddingTop = 24;
    const paddingBottom = 28;
    const alturaGrafico = height - paddingBottom - paddingTop;
    const gap = 10;
    const larguraBarra = (width - gap * (itens.length + 1)) / itens.length;

    const corTexto = getCSSVar('--text-secondary');
    const corTextoForte = getCSSVar('--text-primary');

    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';

    itens.forEach((item, i) => {
        const x = gap + i * (larguraBarra + gap);
        const alturaBarra = (item.value / valorMaximo) * alturaGrafico;
        const y = paddingTop + (alturaGrafico - alturaBarra);

        ctx.fillStyle = item.color || getCSSVar('--accent');
        drawRoundedRectTop(ctx, x, y, larguraBarra, alturaBarra, 4);
        ctx.fill();

        if (item.value > 0) {
            ctx.fillStyle = corTextoForte;
            ctx.fillText(item.value + suffix, x + larguraBarra / 2, y - 6);
        }

        ctx.fillStyle = corTexto;
        ctx.fillText(item.label, x + larguraBarra / 2, height - paddingBottom + 16);
    });
}

// Gráfico de barras horizontais (usado no progresso por disciplina)
// Layout em duas linhas por item: nome + percentual em cima, barra embaixo.
// Isso dá ao nome da disciplina a largura inteira do card, evitando cortes.
function drawHorizontalBarChart(canvasId, itens) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const alturaLinha = 50;
    const height = Math.max(itens.length * alturaLinha + 6, 60);
    const { ctx, width } = setupCanvasHiDPI(canvas, height);
    ctx.clearRect(0, 0, width, height);
    if (itens.length === 0) return;

    const corTexto = getCSSVar('--text-primary');
    const corTrilha = getCSSVar('--border-default');
    const alturaBarra = 10;

    ctx.textBaseline = 'alphabetic';

    itens.forEach((item, i) => {
        const yBase = i * alturaLinha;
        const yLabel = yBase + 15;
        const yBarra = yBase + 26;

        // percentual (medido primeiro pra reservar espaço e o nome não sobrepor)
        const textoPct = item.value + '%';
        ctx.font = '600 12px Inter, sans-serif';
        const larguraPct = ctx.measureText(textoPct).width;

        // nome da disciplina, agora com a largura inteira do card disponível
        ctx.font = '500 13px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = corTexto;
        const larguraDisponivelNome = width - larguraPct - 14;
        let nome = item.label;
        while (ctx.measureText(nome).width > larguraDisponivelNome && nome.length > 1) {
            nome = nome.slice(0, -1);
        }
        if (nome !== item.label) nome = nome.slice(0, -1) + '…';
        ctx.fillText(nome, 0, yLabel);

        // percentual alinhado à direita
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(textoPct, width, yLabel);

        // trilha (ocupa a largura inteira)
        ctx.fillStyle = corTrilha;
        drawRoundedRect(ctx, 0, yBarra, width, alturaBarra, 5);
        ctx.fill();

        // progresso
        const larguraProgresso = (item.value / 100) * width;
        if (larguraProgresso > 0) {
            ctx.fillStyle = item.color;
            drawRoundedRect(ctx, 0, yBarra, Math.max(larguraProgresso, 6), alturaBarra, 5);
            ctx.fill();
        }
    });
}

// Calcula a sequência atual e o recorde de dias consecutivos com estudo
function computeStreaks(history) {
    const datasComEstudo = new Set(Object.keys(history).filter(d => history[d].length > 0));
    if (datasComEstudo.size === 0) return { atual: 0, recorde: 0 };

    let atual = 0;
    const cursor = new Date();
    // se hoje ainda não teve estudo, a sequência pode continuar contando a partir de ontem
    if (!datasComEstudo.has(getLocalYYYYMMDD(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
    }
    while (datasComEstudo.has(getLocalYYYYMMDD(cursor))) {
        atual++;
        cursor.setDate(cursor.getDate() - 1);
    }

    const datasOrdenadas = [...datasComEstudo].sort();
    let recorde = 1;
    let sequenciaAtual = 1;
    for (let i = 1; i < datasOrdenadas.length; i++) {
        const anterior = new Date(datasOrdenadas[i - 1] + 'T00:00:00');
        const atualData = new Date(datasOrdenadas[i] + 'T00:00:00');
        const diffDias = Math.round((atualData - anterior) / 86400000);
        sequenciaAtual = diffDias === 1 ? sequenciaAtual + 1 : 1;
        recorde = Math.max(recorde, sequenciaAtual);
    }
    recorde = Math.max(recorde, atual);

    return { atual, recorde };
}

// Agrupa o histórico de conclusões nos últimos 6 meses
function computeMonthlyStats(history) {
    const hoje = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        let label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        label = label.charAt(0).toUpperCase() + label.slice(1);
        meses.push({ key, label, total: 0 });
    }

    Object.keys(history).forEach(dateStr => {
        const mesKey = dateStr.slice(0, 7);
        const mes = meses.find(m => m.key === mesKey);
        if (mes) mes.total += history[dateStr].length;
    });

    return meses;
}

// Agrupa o histórico de conclusões nas últimas 8 semanas (domingo a sábado)
function computeWeeklyStats(history) {
    const hoje = new Date();
    const inicioSemanaAtual = new Date(hoje);
    inicioSemanaAtual.setHours(0, 0, 0, 0);
    inicioSemanaAtual.setDate(hoje.getDate() - hoje.getDay());

    const semanas = [];
    for (let i = 7; i >= 0; i--) {
        const inicio = new Date(inicioSemanaAtual);
        inicio.setDate(inicioSemanaAtual.getDate() - (i * 7));
        const fim = new Date(inicio);
        fim.setDate(inicio.getDate() + 6);
        const label = `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`;
        semanas.push({ inicio, fim, label, total: 0 });
    }

    Object.keys(history).forEach(dateStr => {
        const data = new Date(dateStr + 'T00:00:00');
        const semana = semanas.find(s => data >= s.inicio && data <= s.fim);
        if (semana) semana.total += history[dateStr].length;
    });

    return semanas;
}

function renderEstatisticas() {
    const emptyState = document.getElementById('estatisticas-empty-state');
    const content = document.getElementById('estatisticas-content');

    // Percentual geral
    let totalAssuntos = 0, totalConcluidos = 0;
    state.disciplinas.forEach(disc => {
        const contarFolhas = (itens) => {
            itens.forEach(item => {
                if (!item.filhos || item.filhos.length === 0) {
                    totalAssuntos++;
                    if (item.concluido) totalConcluidos++;
                } else {
                    contarFolhas(item.filhos);
                }
            });
        };
        contarFolhas(disc.assuntos);
    });

    // Sem nenhum assunto cadastrado em nenhuma disciplina ainda: os gráficos
    // ficariam todos em branco sem explicação, então mostramos um estado
    // vazio explicando o que fazer em vez disso.
    if (totalAssuntos === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    const history = getContributions();
    const percentualGeral = totalAssuntos > 0 ? Math.round((totalConcluidos / totalAssuntos) * 100) : 0;
    document.getElementById('stat-percentual-valor').textContent = percentualGeral + '%';
    drawDonutChart('chart-percentual-geral', percentualGeral, getCSSVar('--accent'));

    // Sequência de estudos
    const { atual, recorde } = computeStreaks(history);
    document.getElementById('stat-streak-valor').textContent = `${atual} dia${atual !== 1 ? 's' : ''}`;
    document.getElementById('stat-streak-recorde').textContent = `Recorde: ${recorde} dia${recorde !== 1 ? 's' : ''}`;

    // Progresso por disciplina
    const canvasDisciplinas = document.getElementById('chart-disciplinas');
    const emptyDisciplinas = document.getElementById('stat-disciplinas-empty');
    if (state.disciplinas.length === 0) {
        canvasDisciplinas.classList.add('hidden');
        emptyDisciplinas.classList.remove('hidden');
    } else {
        canvasDisciplinas.classList.remove('hidden');
        emptyDisciplinas.classList.add('hidden');
        const itensDisciplinas = state.disciplinas.map(d => ({ label: d.nome, value: d.progresso, color: d.cor }));
        drawHorizontalBarChart('chart-disciplinas', itensDisciplinas);
    }

    // Assuntos concluídos por mês
    const meses = computeMonthlyStats(history);
    drawBarChart('chart-mensal', meses.map(m => ({ label: m.label, value: m.total, color: getCSSVar('--accent') })));

    // Assuntos concluídos por semana
    const semanas = computeWeeklyStats(history);
    drawBarChart('chart-semanal', semanas.map(s => ({ label: s.label, value: s.total, color: getCSSVar('--success-green') })));
}

function updateDashboard() {
    const emptyState = document.getElementById('dashboard-empty-state');
    const content = document.getElementById('dashboard-content');
    const semDados = state.disciplinas.length === 0;
    if (emptyState) emptyState.classList.toggle('hidden', !semDados);
    if (content) content.classList.toggle('hidden', semDados);
    if (semDados) return;

    let totalDisciplinas = state.disciplinas.length;
    let totalAssuntos = 0;
    let totalConcluidos = 0;

    state.disciplinas.forEach(disc => {
        let discAssuntos = 0;
        let discConcluidos = 0;

        const contarFolhas = (itens) => {
            itens.forEach(item => {
                if (!item.filhos || item.filhos.length === 0) {
                    discAssuntos++;
                    if (item.concluido) discConcluidos++;
                } else {
                    contarFolhas(item.filhos);
                }
            });
        };

        contarFolhas(disc.assuntos);
        totalAssuntos += discAssuntos;
        totalConcluidos += discConcluidos;
    });

    const totalRestantes = totalAssuntos - totalConcluidos;
    const progressoGeral = totalAssuntos > 0 ? Math.round((totalConcluidos / totalAssuntos) * 100) : 0;

    document.getElementById('dash-disciplinas').textContent = totalDisciplinas;
    animateValue('dash-assuntos', totalAssuntos);
    animateValue('dash-concluidos', totalConcluidos);
    animateValue('dash-restantes', totalRestantes);

    setTimeout(() => {
        const textProgresso = document.getElementById('dash-progresso-text');
        const barra = document.getElementById('dash-progresso-bar');
        
        if (textProgresso) animateValue('dash-progresso-text', progressoGeral, '%');
        if (barra) barra.style.width = progressoGeral + '%';
    }, 50);
}

// Liga os botões do estado vazio do Dashboard: levam pra aba de Disciplinas
// e já abrem o modal certo, em vez de só dizer "vá em Disciplinas".
function initDashboardEmptyState() {
    const btnNova = document.getElementById('dashboard-btn-nova-disciplina');
    const btnImportar = document.getElementById('dashboard-btn-importar');

    if (btnNova) {
        btnNova.addEventListener('click', () => {
            document.querySelector('.nav-link[data-target="disciplinas"]')?.click();
            document.getElementById('btn-new-disciplina')?.click();
        });
    }
    if (btnImportar) {
        btnImportar.addEventListener('click', () => {
            document.querySelector('.nav-link[data-target="disciplinas"]')?.click();
            document.getElementById('modal-importacao')?.classList.add('active');
            document.getElementById('import-text')?.focus();
        });
    }
}

function animateValue(id, end, suffix = '') {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let start = parseInt(obj.textContent) || 0;
    if (start === end) {
        obj.textContent = end + suffix;
        return;
    }
    
    const duration = 800; // ms
    let startTimestamp = null;
    
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        const easeProgress = progress * (2 - progress);
        const currentVal = Math.floor(easeProgress * (end - start) + start);
        
        obj.textContent = currentVal + suffix;
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.textContent = end + suffix;
    };
    window.requestAnimationFrame(step);
}

let disciplinaEditandoId = null;

function initDisciplinas() {
    const btnNewDisciplina = document.getElementById('btn-new-disciplina');
    const modal = document.getElementById('modal-disciplina');
    const modalTitulo = document.getElementById('modal-disciplina-titulo');
    const closeModalBtns = document.querySelectorAll('.close-modal-btn');
    const formDisciplina = document.getElementById('form-disciplina');

    btnNewDisciplina.addEventListener('click', () => {
        disciplinaEditandoId = null;
        modalTitulo.textContent = 'Nova Disciplina';
        formDisciplina.querySelector('button[type="submit"]').textContent = 'Salvar';
        modal.classList.add('active');
        document.getElementById('disciplina-nome').focus();
    });

    const closeModal = () => { modal.classList.remove('active'); formDisciplina.reset(); disciplinaEditandoId = null; };
    closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

    formDisciplina.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('disciplina-nome').value.trim();
        const cor = document.getElementById('disciplina-cor').value;

        if (!nome) return;

        if (disciplinaEditandoId) {
            const disc = state.disciplinas.find(d => d.id === disciplinaEditandoId);
            if (disc) {
                disc.nome = nome;
                disc.cor = cor;
            }
        } else {
            state.disciplinas.push({ id: 'disc_' + Date.now(), nome: nome, cor: cor, progresso: 0, qtdAssuntos: 0, assuntos: [] });
        }

        saveStateAndRefresh();
        renderDisciplinas();
        // Se a disciplina editada é a que está aberta no momento, atualiza o título na tela de detalhes
        if (disciplinaEditandoId && state.currentDisciplinaId === disciplinaEditandoId) {
            document.getElementById('detalhe-disciplina-nome').textContent = nome;
        }
        closeModal();
    });

    renderDisciplinas();

    // Conectado uma única vez aqui (não a cada renderDisciplinas): o grid em
    // si nunca é recriado, só o innerHTML dele muda, então isso evita
    // acumular listeners de arraste duplicados a cada renderização.
    tornarReordenavel(document.getElementById('disciplinas-grid'), '.disciplina-card', (novaOrdemIds) => {
        state.disciplinas.sort((a, b) => novaOrdemIds.indexOf(a.id) - novaOrdemIds.indexOf(b.id));
        saveStateAndRefresh();
    });
}

function editarDisciplina(id) {
    const disc = state.disciplinas.find(d => d.id === id);
    if (!disc) return;

    disciplinaEditandoId = id;
    document.getElementById('modal-disciplina-titulo').textContent = 'Editar Disciplina';
    document.getElementById('disciplina-nome').value = disc.nome;
    document.getElementById('disciplina-cor').value = disc.cor;
    document.querySelector('#form-disciplina button[type="submit"]').textContent = 'Salvar alterações';
    document.getElementById('modal-disciplina').classList.add('active');
    document.getElementById('disciplina-nome').focus();
}

function initAssuntos() {
    const btnBack = document.getElementById('btn-back-disciplinas');
    const formAssunto = document.getElementById('form-assunto');
    const btnDeleteDisciplinaAtual = document.getElementById('btn-delete-disciplina-atual');

    btnBack.addEventListener('click', () => {
        showDisciplinasMainList();
        irParaNivel(1);
    });

    btnDeleteDisciplinaAtual.addEventListener('click', () => {
        if (state.currentDisciplinaId) deleteDisciplina(state.currentDisciplinaId);
    });

    // Conectado uma única vez aqui (não a cada renderTree): a raiz da árvore
    // nunca é recriada, só o innerHTML dela muda, então isso evita acumular
    // listeners de arraste duplicados a cada renderização. Os grupos
    // aninhados (.tree-children) são recriados a cada render, então esses
    // são conectados dentro do próprio renderTree.
    tornarReordenavel(document.getElementById('assuntos-tree'), '.tree-node, .tree-leaf', (novaOrdemIds) => {
        const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
        if (disciplina) reordenarNivel(disciplina, null, novaOrdemIds);
    });

    formAssunto.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!state.currentDisciplinaId) return;

        const tituloInput = document.getElementById('assunto-titulo');
        const titulo = tituloInput.value.trim();

        if (!titulo) return;

        const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
        if (disciplina) {
            disciplina.assuntos.push({ id: 'item_' + Date.now(), titulo: titulo, concluido: false, filhos: [] });
            tituloInput.value = '';
            recalcularDisciplina(disciplina);
            saveStateAndRefresh();
            renderTree();
        }
    });
}

function initImportador() {
    const modalImport = document.getElementById('modal-importacao');
    const closeImportBtns = document.querySelectorAll('.close-import-btn');
    const formImport = document.getElementById('form-importacao');
    const importText = document.getElementById('import-text');

    const closeImportModal = () => { modalImport.classList.remove('active'); formImport.reset(); };
    closeImportBtns.forEach(btn => btn.addEventListener('click', closeImportModal));

    formImport.addEventListener('submit', (e) => {
        e.preventDefault();
        const rawText = importText.value;
        if (!rawText.trim()) return;

        const blocos = rawText.split(/\n\s*\n/);
        let timestampOffset = 0;
        let disciplinasCriadas = 0, disciplinasAtualizadas = 0, assuntosCriados = 0;

        blocos.forEach(bloco => {
            const linhas = bloco.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (linhas.length === 0) return;

            const nomeDisciplina = linhas[0];
            const assuntosDaMateria = linhas.slice(1);
            let disciplina = state.disciplinas.find(d => d.nome.toLowerCase() === nomeDisciplina.toLowerCase());
            
            if (!disciplina) {
                const corAleatoria = PALETA_CORES[Math.floor(Math.random() * PALETA_CORES.length)];
                disciplina = { id: 'disc_' + (Date.now() + timestampOffset++), nome: nomeDisciplina, cor: corAleatoria, progresso: 0, qtdAssuntos: 0, assuntos: [] };
                state.disciplinas.push(disciplina);
                disciplinasCriadas++;
            } else {
                disciplinasAtualizadas++;
            }

            assuntosDaMateria.forEach(tituloAssunto => {
                disciplina.assuntos.push({ id: 'item_' + (Date.now() + timestampOffset++), titulo: tituloAssunto, concluido: false, filhos: [] });
                assuntosCriados++;
            });

            recalcularDisciplina(disciplina);
        });

        saveStateAndRefresh();
        renderDisciplinas();
        closeImportModal();

        // Fecha o loop: o usuário colou um texto e o modal simplesmente
        // some — sem isso não dava pra saber se o processamento funcionou
        // nem quanto foi criado.
        const partes = [];
        if (disciplinasCriadas > 0) partes.push(`${disciplinasCriadas} disciplina${disciplinasCriadas !== 1 ? 's' : ''} nova${disciplinasCriadas !== 1 ? 's' : ''}`);
        if (disciplinasAtualizadas > 0) partes.push(`${disciplinasAtualizadas} atualizada${disciplinasAtualizadas !== 1 ? 's' : ''}`);
        partes.push(`${assuntosCriados} assunto${assuntosCriados !== 1 ? 's' : ''}`);
        mostrarToast(`Importação concluída: ${partes.join(', ')}`, { duracao: 5000 });
    });
}

/**
 * MENU "MAIS OPÇÕES" (Importar edital, Exportar/Restaurar backup)
 */
function initMaisOpcoes() {
    const btn = document.getElementById('btn-mais-opcoes');
    if (!btn) return;

    btn.addEventListener('click', () => {
        abrirMenuAcoes({
            titulo: 'Mais opções',
            acoes: [
                {
                    label: 'Importar edital',
                    icone: '📋',
                    onClick: () => {
                        document.getElementById('modal-importacao').classList.add('active');
                        document.getElementById('import-text').focus();
                    }
                },
                { label: 'Exportar backup (.json)', icone: '⬇️', onClick: exportarBackup },
                { label: 'Restaurar backup', icone: '⬆️', onClick: () => document.getElementById('input-restaurar-backup').click() }
            ]
        });
    });
}

/**
 * BACKUP & RESTAURAÇÃO
 */
function exportarBackup() {
    const payload = {
        app: 'Study Tracker',
        versao: 1,
        exportadoEm: new Date().toISOString(),
        disciplinas: state.disciplinas
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-tracker-backup-${getLocalYYYYMMDD()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function initBackupRestore() {
    const input = document.getElementById('input-restaurar-backup');
    if (!input) return;

    input.addEventListener('change', (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;

        const leitor = new FileReader();
        leitor.onload = (evt) => {
            try {
                const dados = JSON.parse(evt.target.result);
                const disciplinas = Array.isArray(dados) ? dados : dados.disciplinas;
                if (!Array.isArray(disciplinas)) throw new Error('Formato inválido');

                // Em vez de bloquear com confirm() ANTES de restaurar, restaura
                // na hora e guarda o estado anterior — o toast com "Desfazer"
                // dá uma janela de segurança sem interromper o fluxo.
                const estadoAnterior = state.disciplinas;
                state.disciplinas = disciplinas;
                saveStateAndRefresh();
                showDisciplinasMainList();

                mostrarToast(`Backup restaurado: ${disciplinas.length} disciplina(s)`, {
                    acaoLabel: 'Desfazer',
                    duracao: 8000,
                    onAcao: () => {
                        state.disciplinas = estadoAnterior;
                        saveStateAndRefresh();
                        showDisciplinasMainList();
                    }
                });
            } catch (err) {
                mostrarToast('Não foi possível ler esse arquivo. Confira se é um backup válido do Study Tracker (.json).', { perigo: true, duracao: 5000 });
            } finally {
                input.value = '';
            }
        };
        leitor.readAsText(arquivo);
    });
}

function initSearchEngine() {
    const searchInput = document.getElementById('global-search');
    const resultsContainer = document.getElementById('search-results');

    buildSearchIndex();

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();

        if (!query) {
            resultsContainer.classList.add('hidden');
            resultsContainer.innerHTML = '';
            return;
        }

        const filtrados = flatSearchIndex.filter(item => item.titulo.toLowerCase().includes(query)).slice(0, 20);

        if (filtrados.length === 0) {
            resultsContainer.innerHTML = `<div class="search-result-item" style="color: var(--text-secondary); cursor: default;">Nenhum assunto encontrado</div>`;
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = filtrados.map(item => {
            const regex = new RegExp(`(${query})`, 'gi');
            const tituloDestacado = escapeHTML(item.titulo).replace(regex, '<mark>$1</mark>');
            return `
                <div class="search-result-item" onclick="goToSearchTarget('${item.disciplinaId}', '${item.id}')">
                    <div class="search-result-text">${tituloDestacado}</div>
                    <span class="search-result-discipline" style="background-color: ${item.disciplinaCor}20; color: ${item.disciplinaCor}; border: 1px solid ${item.disciplinaCor}40">
                        ${escapeHTML(item.disciplinaNome)}
                    </span>
                </div>`;
        }).join('');
        resultsContainer.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-card')) resultsContainer.classList.add('hidden');
    });
}

function buildSearchIndex() {
    flatSearchIndex = [];
    state.disciplinas.forEach(disciplina => {
        const indexarNo = (item) => {
            flatSearchIndex.push({ id: item.id, titulo: item.titulo, disciplinaId: disciplina.id, disciplinaNome: disciplina.nome, disciplinaCor: disciplina.cor });
            if (item.filhos) item.filhos.forEach(indexarNo);
        };
        disciplina.assuntos.forEach(indexarNo);
    });
}

function openDisciplinaDetalhes(id) {
    state.currentDisciplinaId = id;
    const disciplina = state.disciplinas.find(d => d.id === id);
    if (!disciplina) return;

    document.getElementById('disciplinas-list-container').classList.add('hidden');
    document.getElementById('disciplina-detalhes-container').classList.remove('hidden');
    document.getElementById('detalhe-disciplina-nome').textContent = disciplina.nome;
    renderTree();
    irParaNivel(2);
    mostrarDicaToqueLongoUmaVez();
}
// Exposta em window por segurança (chamada de vários lugares no código);
// não é mais necessária pra onclick inline, mas mantida por conveniência.
window.openDisciplinaDetalhes = openDisciplinaDetalhes;

function showDisciplinasMainList() {
    state.currentDisciplinaId = null;
    document.getElementById('disciplina-detalhes-container').classList.add('hidden');
    document.getElementById('disciplinas-list-container').classList.remove('hidden');
    renderDisciplinas();
}

function deleteDisciplina(id) {
    const indiceOriginal = state.disciplinas.findIndex(d => d.id === id);
    if (indiceOriginal === -1) return;
    const [disciplinaRemovida] = state.disciplinas.splice(indiceOriginal, 1);

    saveStateAndRefresh();

    // Se a disciplina excluída era a que estava aberta, volta pra lista principal
    if (state.currentDisciplinaId === id) {
        showDisciplinasMainList();
        irParaNivel(1);
    } else {
        renderDisciplinas();
    }

    // Exclui na hora, sem diálogo bloqueante — "Desfazer" cobre o arrependimento
    // sem interromper quem tinha certeza da ação.
    mostrarToast(`Disciplina "${disciplinaRemovida.nome}" excluída`, {
        perigo: true,
        acaoLabel: 'Desfazer',
        onAcao: () => {
            state.disciplinas.splice(indiceOriginal, 0, disciplinaRemovida);
            saveStateAndRefresh();
            if (document.getElementById('disciplinas-view').classList.contains('active')) {
                showDisciplinasMainList();
            }
        }
    });
}
// Exposta em window por segurança (chamada de vários lugares no código);
// não é mais necessária pra onclick inline, mas mantida por conveniência.
window.deleteDisciplina = deleteDisciplina;

async function promptAddSubItem(paiId) {
    const subTitulo = await abrirModalTexto({
        titulo: 'Adicionar sub-assunto',
        placeholder: 'Nome do sub-assunto ou grupo',
        labelBotao: 'Adicionar'
    });
    if (!subTitulo) return;

    const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
    if (!disciplina) return;

    const encontrarENserir = (itens) => {
        for (let item of itens) {
            if (item.id === paiId) {
                item.filhos.push({ id: 'item_' + Date.now(), titulo: subTitulo, concluido: false, filhos: [] });
                return true;
            }
            if (item.filhos && item.filhos.length > 0 && encontrarENserir(item.filhos)) return true;
        }
        return false;
    };

    encontrarENserir(disciplina.assuntos);
    recalcularDisciplina(disciplina);
    saveStateAndRefresh();
    renderTree();
}

async function editarAssunto(id) {
    const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
    if (!disciplina) return;

    let item = null;
    const buscar = (itens) => {
        for (const i of itens) {
            if (i.id === id) { item = i; return true; }
            if (i.filhos && i.filhos.length > 0 && buscar(i.filhos)) return true;
        }
        return false;
    };
    buscar(disciplina.assuntos);
    if (!item) return;

    const novoTitulo = await abrirModalTexto({
        titulo: 'Editar assunto',
        valorInicial: item.titulo,
        labelBotao: 'Salvar alterações'
    });
    if (!novoTitulo) return;

    item.titulo = novoTitulo;
    saveStateAndRefresh();
    renderTree();
}

window.toggleTreeItem = function(id) {
    const d = state.disciplinas.find(disc => disc.id === state.currentDisciplinaId);
    if (!d) return;

    const todayStr = getLocalYYYYMMDD();
    let novoStatus = null;

    const alternarStatus = (itens) => {
        for (let item of itens) {
            if (item.id === id) {
                item.concluido = !item.concluido;
                novoStatus = item.concluido;
                // Anexa a data de conclusão apenas se for finalizado
                if (item.concluido) item.dataConclusao = todayStr;
                else delete item.dataConclusao;
                
                if (item.filhos && item.filhos.length > 0) marcarFilhos(item.filhos, item.concluido, todayStr);
                return true;
            }
            if (item.filhos && item.filhos.length > 0 && alternarStatus(item.filhos)) return true;
        }
        return false;
    };

    const marcarFilhos = (filhos, status, dateStr) => {
        filhos.forEach(f => { 
            f.concluido = status; 
            if (status) f.dataConclusao = dateStr; else delete f.dataConclusao;
            if (f.filhos && f.filhos.length > 0) marcarFilhos(f.filhos, status, dateStr); 
        });
    };

    alternarStatus(d.assuntos);
    recalcularDisciplina(d);
    saveStateAndRefresh();
    renderTree();

    // Só confirma ao MARCAR como concluído (não ao desmarcar) — fecha o
    // loop de "salvou?" sem gerar ruído a cada clique na árvore.
    if (novoStatus) {
        mostrarToast(`${d.nome}: ${d.progresso}% concluído`, { duracao: 2200 });
    }
};

function deleteTreeItem(id) {
    const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
    if (!disciplina) return;

    // Remove já guardando de onde saiu (array pai + índice), pra poder
    // devolver exatamente no mesmo lugar se o usuário tocar em "Desfazer".
    let itemRemovido = null, arrayPai = null, indiceOriginal = -1;
    const removerDoNivel = (itens) => {
        const idx = itens.findIndex(i => i.id === id);
        if (idx !== -1) {
            arrayPai = itens;
            indiceOriginal = idx;
            itemRemovido = itens[idx];
            itens.splice(idx, 1);
            return true;
        }
        for (const item of itens) {
            if (item.filhos && item.filhos.length > 0 && removerDoNivel(item.filhos)) return true;
        }
        return false;
    };
    removerDoNivel(disciplina.assuntos);
    if (!itemRemovido) return;

    recalcularDisciplina(disciplina);
    saveStateAndRefresh();
    renderTree();

    mostrarToast(`"${itemRemovido.titulo}" excluído`, {
        perigo: true,
        acaoLabel: 'Desfazer',
        onAcao: () => {
            arrayPai.splice(indiceOriginal, 0, itemRemovido);
            recalcularDisciplina(disciplina);
            saveStateAndRefresh();
            if (state.currentDisciplinaId === disciplina.id) renderTree();
        }
    });
}

function recalcularDisciplina(disciplina) {
    let totaisGerais = 0;
    let concluidosGerais = 0;

    const processarNo = (item) => {
        if (!item.filhos || item.filhos.length === 0) {
            totaisGerais++;
            if (item.concluido) concluidosGerais++;
            return { total: 1, concluidos: item.concluido ? 1 : 0 };
        } else {
            let subTotal = 0;
            let subConcluidos = 0;
            item.filhos.forEach(f => {
                const res = processarNo(f);
                subTotal += res.total;
                subConcluidos += res.concluidos;
            });
            item.concluido = (subTotal > 0 && subTotal === subConcluidos);
            return { total: subTotal, concluidos: subConcluidos };
        }
    };

    disciplina.assuntos.forEach(processarNo);
    disciplina.qtdAssuntos = totaisGerais;
    disciplina.progresso = totaisGerais > 0 ? Math.round((concluidosGerais / totaisGerais) * 100) : 0;
}

function saveStateAndRefresh() {
    localStorage.setItem('st_disciplinas', JSON.stringify(state.disciplinas));
    buildSearchIndex();
    updateDashboard();
}

/**
 * INTERAÇÕES: TOQUE LONGO, ARRASTAR PRA REORDENAR E MENU DE AÇÕES
 *
 * Os antigos botões de "+" e "excluir" dependiam de :hover, que não existe
 * em telas de toque — ficavam invisíveis mas ainda ocupavam espaço e podiam
 * ser acionados sem querer. Substituímos por dois gestos:
 *   - Toque longo (segurar ~500ms parado) no card/item -> abre um menu de
 *     ações (editar, adicionar sub-assunto, excluir).
 *   - Arrastar pela alcinha "⠿" (sempre visível) -> reordena os irmãos.
 */

// Detecta um toque longo num elemento, sem interferir com toques rápidos
// (tap normal) nem com o gesto de rolar a página.
function attachLongPress(el, callback, { moveThreshold = 18, duration = 500 } = {}) {
    let timer = null;
    let startX = 0, startY = 0;
    let disparado = false;
    let pointerId = null;

    const cancelar = () => {
        clearTimeout(timer);
        timer = null;
        pointerId = null;
    };

    el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.drag-handle, .assunto-checkbox, .checkbox-tap')) return;
        // Ignora um segundo dedo enquanto já estamos contando
        if (timer) return;

        disparado = false;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;

        timer = setTimeout(() => {
            disparado = true;
            timer = null;
            if (navigator.vibrate) navigator.vibrate(15);
            callback(e);
        }, duration);
    });

    el.addEventListener('pointermove', (e) => {
        if (!timer || e.pointerId !== pointerId) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > moveThreshold || dy > moveThreshold) cancelar();
    });

    el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== pointerId) return;
        cancelar();
    });

    el.addEventListener('pointercancel', (e) => {
        if (e.pointerId !== pointerId) return;
        cancelar();
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // Bloqueia o clique que o sistema gera logo após um toque longo
    el.addEventListener('click', (e) => {
        if (disparado) {
            e.preventDefault();
            e.stopPropagation();
            disparado = false;
        }
    }, true);
}
// Torna os filhos diretos de um container reordenáveis via arraste pela
// alça ".drag-handle". Ao soltar, chama onReorder() pra persistir a nova
// ordem (a própria função já reordenou o DOM visualmente durante o arraste).
// `itemSelector` deve ser um seletor simples (ex: '.tree-node, .tree-leaf'),
// SEM ":scope >" — ":scope" dentro de .closest() se refere ao próprio
// elemento em que .closest() foi chamado, não ao container, então usar
// ":scope >" ali simplesmente nunca casava com nada.
function tornarReordenavel(containerEl, itemSelector, onReorder, signal) {
    let itemArrastado = null;
    let placeholder = null;
    let pointerIdAtivo = null;
    let offsetY = 0;

    const getIrmaos = () => Array.from(containerEl.children).filter(el => el.matches(itemSelector) && el !== placeholder);
    const opts = signal ? { signal } : {};

    containerEl.addEventListener('pointerdown', (e) => {
        const handle = e.target.closest('.drag-handle');
        if (!handle || !containerEl.contains(handle)) return;
        const item = handle.closest(itemSelector);
        if (!item || item.parentElement !== containerEl) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = item.getBoundingClientRect();
        offsetY = e.clientY - rect.top;

        // Placeholder: ocupa o espaço do item no DOM enquanto ele flutua
        placeholder = document.createElement('div');
        placeholder.style.cssText = `height:${rect.height}px;border:2px dashed var(--accent);border-radius:6px;background:rgba(47,129,247,0.07);box-sizing:border-box;`;
        item.parentNode.insertBefore(placeholder, item.nextSibling);

        // Sai do fluxo e flutua sobre os irmãos
        item.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:999;pointer-events:none;`;

        itemArrastado = item;
        pointerIdAtivo = e.pointerId;
        item.classList.add('sendo-arrastado');
        document.body.classList.add('arrastando-item');

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, opts);

    containerEl.addEventListener('click', (e) => {
        if (e.target.closest('.drag-handle')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    let prevY = 0;

    function onMove(e) {
        if (!itemArrastado || e.pointerId !== pointerIdAtivo) return;

        // Move o item flutuante junto com o dedo/mouse
        itemArrastado.style.top = (e.clientY - offsetY) + 'px';

        const direcao = e.clientY > prevY ? 1 : -1; // 1 = descendo, -1 = subindo
        prevY = e.clientY;

        // Irmãos reais: exclui o placeholder e o item arrastado (que está fixed)
        const irmaos = Array.from(containerEl.children).filter(
            el => el !== placeholder && el !== itemArrastado && el.matches(itemSelector)
        );

        // Algoritmo do SortableJS: compara o ponteiro com o terço superior/inferior
        // de cada irmão levando em conta a direção do movimento.
        // - Descendo: só ultrapassa o irmão quando o ponteiro passa dos 2/3 dele
        // - Subindo:  só volta quando o ponteiro sobe acima de 1/3 dele
        // Isso cria uma zona morta de 33% no meio que absorve micro-oscilações
        // e evita o placeholder ficar "preso" quando muda de lado.
        let novoAntes = null; // null = vai pro final do container

        for (const irmao of irmaos) {
            const rect = irmao.getBoundingClientRect();
            const limiar = direcao === 1
                ? rect.top + rect.height * 0.66  // descendo: ultrapassa depois de 66%
                : rect.top + rect.height * 0.33; // subindo:  volta antes de 33%

            if (e.clientY < limiar) {
                novoAntes = irmao;
                break;
            }
        }

        // Só reordena o DOM se o slot alvo mudou — evita reflow desnecessário
        const slotAtual = placeholder.nextElementSibling;
        if (novoAntes !== slotAtual) {
            if (novoAntes === null) {
                containerEl.appendChild(placeholder);
            } else {
                containerEl.insertBefore(placeholder, novoAntes);
            }
        }
    }

    function onUp(e) {
        if (!itemArrastado || e.pointerId !== pointerIdAtivo) return;

        // Devolve o item ao fluxo normal, no lugar do placeholder
        itemArrastado.style.cssText = '';
        itemArrastado.classList.remove('sendo-arrastado');
        placeholder.parentNode.insertBefore(itemArrastado, placeholder);
        placeholder.remove();
        placeholder = null;

        document.body.classList.remove('arrastando-item');
        try { itemArrastado.releasePointerCapture(pointerIdAtivo); } catch (_) {}
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);

        const novaOrdemIds = getIrmaos().map(el => el.dataset.id);
        itemArrastado = null;
        pointerIdAtivo = null;
        onReorder(novaOrdemIds);
    }
}

// Abre o bottom sheet de ações com os botões passados em `acoes`.
function abrirMenuAcoes({ titulo, acoes }) {
    const modal = document.getElementById('modal-acoes');
    const tituloEl = document.getElementById('acoes-sheet-titulo');
    const lista = document.getElementById('acoes-sheet-lista');

    tituloEl.textContent = titulo;
    lista.innerHTML = '';

    acoes.forEach(acao => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'acao-item' + (acao.perigo ? ' perigo' : '');
        btn.innerHTML = `<span class="acao-icone">${acao.icone}</span><span>${escapeHTML(acao.label)}</span>`;
        btn.addEventListener('click', () => {
            fecharMenuAcoes();
            acao.onClick();
        });
        lista.appendChild(btn);
    });

    modal.classList.add('active');
}

function fecharMenuAcoes() {
    document.getElementById('modal-acoes').classList.remove('active');
}

function initMenuAcoes() {
    const modal = document.getElementById('modal-acoes');
    modal.querySelector('.acoes-sheet-cancelar').addEventListener('click', fecharMenuAcoes);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharMenuAcoes();
    });
}

function renderDisciplinas() {
    const grid = document.getElementById('disciplinas-grid');
    if (!grid) return;

    if (state.disciplinas.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <h3>Nenhuma disciplina ainda</h3>
                <p>Crie sua primeira disciplina manualmente ou importe um edital inteiro de uma vez.</p>
                <div class="empty-state-actions">
                    <button type="button" class="btn btn-primary" id="empty-btn-nova-disciplina">Nova disciplina</button>
                    <button type="button" class="btn btn-secondary" id="empty-btn-importar">Importar edital</button>
                </div>
            </div>`;
        document.getElementById('empty-btn-nova-disciplina')?.addEventListener('click', () => {
            document.getElementById('btn-new-disciplina')?.click();
        });
        document.getElementById('empty-btn-importar')?.addEventListener('click', () => {
            document.getElementById('modal-importacao')?.classList.add('active');
            document.getElementById('import-text')?.focus();
        });
        return;
    }

    // Distinção visual de status: sem isso, "não começou" e "em andamento"
    // só se diferenciavam pelo número da barra de progresso, difícil de
    // escanear rapidamente numa lista de várias disciplinas.
    const statusDisciplina = (disc) => {
        if (disc.progresso >= 100 && disc.qtdAssuntos > 0) return { classe: 'concluido', label: 'Concluído' };
        if (disc.progresso > 0) return { classe: 'em-andamento', label: 'Em andamento' };
        return { classe: 'nao-iniciado', label: 'Não iniciado' };
    };

    grid.innerHTML = state.disciplinas.map(disc => {
        const status = statusDisciplina(disc);
        return `
        <div class="card disciplina-card status-${status.classe}" data-id="${disc.id}" style="border-left-color: ${disc.cor}">
            <div class="disciplina-card-header">
                <button class="drag-handle" aria-label="Arrastar para reordenar" title="Arrastar para reordenar"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></button>
                <h3 class="disciplina-card-titulo">${escapeHTML(disc.nome)}</h3>
                <span class="disciplina-status-badge ${status.classe}">${status.label}</span>
            </div>
            <div class="disciplina-meta">
                <span>Assuntos: <strong>${disc.qtdAssuntos}</strong></span>
                <span>Progresso: <strong>${disc.progresso}%</strong></span>
            </div>
            <div class="progress-container"><div class="progress-bar" style="width: ${disc.progresso}%; background-color: ${disc.cor}"></div></div>
        </div>
    `;
    }).join('');

    grid.querySelectorAll('.disciplina-card').forEach(card => {
        const id = card.dataset.id;

        // A ordem importa: dois listeners de "click" no MESMO elemento disparam
        // na ordem em que foram registrados, então o bloqueio de clique do
        // toque longo precisa ser registrado ANTES do clique que abre a
        // disciplina — senão o toque longo abriria a disciplina e mostraria
        // o menu ao mesmo tempo.
        attachLongPress(card, () => {
            const disc = state.disciplinas.find(d => d.id === id);
            if (!disc) return;
            abrirMenuAcoes({
                titulo: disc.nome,
                acoes: [
                    { label: 'Editar disciplina', icone: '✏️', onClick: () => editarDisciplina(id) },
                    { label: 'Excluir disciplina', icone: '🗑', perigo: true, onClick: () => deleteDisciplina(id) }
                ]
            });
        });

        card.addEventListener('click', (e) => {
            if (e.target.closest('.drag-handle')) return;
            openDisciplinaDetalhes(id);
        });
    });
}

function renderTree() {
    const container = document.getElementById('assuntos-tree');
    if (!container) return;

    const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
    if (!disciplina) return;

    document.getElementById('detalhe-disciplina-progresso').textContent = `${disciplina.progresso}% concluído (${disciplina.qtdAssuntos} sub-tópicos monitorados)`;

    if (disciplina.assuntos.length === 0) {
        container.innerHTML = `<div class="empty-state" style="border:none;"><p>Nenhum assunto cadastrado.</p></div>`;
        return;
    }

    const gerarHTMLNo = (item) => {
        if (item.filhos && item.filhos.length > 0) {
            let totalFilhosFinais = 0, concluidosFilhosFinais = 0;
            const contarFolhas = (no) => {
                if (!no.filhos || no.filhos.length === 0) { totalFilhosFinais++; if (no.concluido) concluidosFilhosFinais++; }
                else no.filhos.forEach(contarFolhas);
            };
            contarFolhas(item);
            const pctLocal = totalFilhosFinais > 0 ? Math.round((concluidosFilhosFinais / totalFilhosFinais) * 100) : 0;

            return `
                <div class="tree-node" data-id="${item.id}">
                    <details class="tree-details" open>
                        <summary class="tree-summary">
                            <button class="drag-handle" aria-label="Arrastar para reordenar" title="Arrastar para reordenar"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></button>
                            <div class="summary-content">
                                <span class="summary-toggle-icon">▶</span>
                                <label class="checkbox-tap" onclick="event.stopPropagation(); toggleTreeItem('${item.id}')"><input type="checkbox" class="assunto-checkbox" tabindex="-1" ${item.concluido ? 'checked' : ''}></label>
                                <span style="text-decoration: ${item.concluido ? 'line-through' : 'none'}; opacity: ${item.concluido ? 0.6 : 1}">${escapeHTML(item.titulo)}</span>
                            </div>
                            <span class="node-badge ${pctLocal === 100 ? 'concluido' : ''}">${pctLocal}%</span>
                        </summary>
                        <div class="tree-children" data-parent-id="${item.id}">${item.filhos.map(gerarHTMLNo).join('')}</div>
                    </details>
                </div>
            `;
        } else {
            return `
                <div class="tree-leaf ${item.concluido ? 'concluido' : ''}" data-id="${item.id}">
                    <button class="drag-handle" aria-label="Arrastar para reordenar" title="Arrastar para reordenar"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></button>
                    <label class="checkbox-tap" onclick="toggleTreeItem('${item.id}')"><input type="checkbox" class="assunto-checkbox" tabindex="-1" ${item.concluido ? 'checked' : ''}></label>
                    <label class="tree-leaf-titulo" onclick="toggleTreeItem('${item.id}')">${escapeHTML(item.titulo)}</label>
                </div>
            `;
        }
    };

    container.innerHTML = disciplina.assuntos.map(gerarHTMLNo).join('');

    // Toque longo em qualquer item (nó ou folha) -> menu de ações
    container.querySelectorAll('.tree-node, .tree-leaf').forEach(itemEl => {
        const id = itemEl.dataset.id;
        const alvo = itemEl.classList.contains('tree-node')
            ? itemEl.querySelector(':scope > .tree-details > .tree-summary')
            : itemEl;

        attachLongPress(alvo, () => {
            let item = null;
            const buscar = (itens) => {
                for (const i of itens) {
                    if (i.id === id) { item = i; return true; }
                    if (i.filhos && i.filhos.length > 0 && buscar(i.filhos)) return true;
                }
                return false;
            };
            buscar(disciplina.assuntos);
            if (!item) return;

            abrirMenuAcoes({
                titulo: item.titulo,
                acoes: [
                    { label: 'Adicionar sub-assunto', icone: '➕', onClick: () => promptAddSubItem(id) },
                    { label: 'Editar', icone: '✏️', onClick: () => editarAssunto(id) },
                    { label: 'Excluir', icone: '🗑', perigo: true, onClick: () => deleteTreeItem(id) }
                ]
            });
        });
    });

    // Arrastar pra reordenar nos níveis aninhados (.tree-children é recriado
    // a cada renderTree, então precisamos cancelar os listeners do render
    // anterior antes de criar novos, para não acumular e causar flickering).
    treeDragControllers.forEach(ac => ac.abort());
    treeDragControllers = [];

    container.querySelectorAll('.tree-children').forEach(nivel => {
        const ac = new AbortController();
        treeDragControllers.push(ac);
        tornarReordenavel(nivel, '.tree-node, .tree-leaf', (novaOrdemIds) => {
            reordenarNivel(disciplina, nivel.dataset.parentId, novaOrdemIds);
        }, ac.signal);
    });
}

// Reordena o array de assuntos (raiz, quando parentId é null/undefined) ou
// os filhos de um item específico, de acordo com a nova ordem de ids.
function reordenarNivel(disciplina, parentId, novaOrdemIds) {
    const arrayAlvo = parentId ? encontrarFilhosPorId(disciplina.assuntos, parentId) : disciplina.assuntos;
    if (!arrayAlvo) return;
    arrayAlvo.sort((a, b) => novaOrdemIds.indexOf(a.id) - novaOrdemIds.indexOf(b.id));
    saveStateAndRefresh();
}

function encontrarFilhosPorId(itens, id) {
    for (const item of itens) {
        if (item.id === id) return item.filhos;
        if (item.filhos && item.filhos.length > 0) {
            const achado = encontrarFilhosPorId(item.filhos, id);
            if (achado) return achado;
        }
    }
    return null;
}

window.goToSearchTarget = function(disciplinaId, itemId) {
    document.getElementById('global-search').value = '';
    document.getElementById('search-results').classList.add('hidden');

    const btnNav = document.querySelector('.nav-link[data-target="disciplinas"]');
    if (btnNav) btnNav.click();
    openDisciplinaDetalhes(disciplinaId);

    // Após abrir a disciplina, rola até o item e o destaca.
    // Usa requestAnimationFrame duplo para garantir que o renderTree() terminou
    // e o DOM da árvore já está no documento antes de tentar localizar o elemento.
    if (!itemId) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // O item pode ser uma .tree-leaf ou um .tree-node — o data-id está
            // no elemento raiz de ambos.
            const el = document.querySelector(`[data-id="${itemId}"]`);
            if (!el) return;

            // Garante que todos os <details> ancestrais estejam abertos
            let pai = el.parentElement;
            while (pai) {
                if (pai.tagName === 'DETAILS') pai.open = true;
                pai = pai.parentElement;
            }

            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Destaque visual por 2 segundos (animation definida no CSS)
            el.classList.remove('item-destacado');
            void el.offsetWidth; // força reflow para reiniciar a animação se chamado duas vezes
            el.classList.add('item-destacado');
            setTimeout(() => el.classList.remove('item-destacado'), 2200);
        });
    });
};

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}