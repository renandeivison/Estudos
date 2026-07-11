/**
 * Study Tracker - Core Application
 */

const state = {
    disciplinas: JSON.parse(localStorage.getItem('st_disciplinas')) || [],
    currentDisciplinaId: null
};

let flatSearchIndex = [];
const PALETA_CORES = ['#2f81f7', '#347d39', '#f28749', '#76e150', '#bc8cff', '#ff7b72', '#f6e05e'];

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
    initSearchEngine();
    initPWA();
    updateDashboard();
});

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

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const targetView = button.getAttribute('data-target');
            
            navLinks.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `${targetView}-view`) section.classList.add('active');
            });

            if (targetView === 'disciplinas') showDisciplinasMainList();
            if (targetView === 'dashboard') updateDashboard();
            if (targetView === 'calendario') renderHeatmap();
            if (targetView === 'estatisticas') renderEstatisticas();
        });
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
    if (!container) return;

    const history = getContributions();
    const today = new Date();
    
    // Calcula 365 dias atrás (ajustando para o último domingo)
    const startDate = new Date();
    startDate.setFullYear(today.getFullYear() - 1);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let html = '<div class="heatmap-grid">';
    let currentDate = new Date(startDate);

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
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    html += '</div>';
    container.innerHTML = html;

    // Rola para o final da grid (foco no hoje)
    container.scrollLeft = container.scrollWidth;

    // Adiciona interatividade nos quadrados
    document.querySelectorAll('.heatmap-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            document.querySelectorAll('.heatmap-cell').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
            
            const dateStr = e.target.getAttribute('data-date');
            showCalendarioDetails(dateStr, history[dateStr] || []);
        });
    });
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
    const size = 160;
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
function drawHorizontalBarChart(canvasId, itens) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const alturaLinha = 36;
    const height = Math.max(itens.length * alturaLinha + 10, 60);
    const { ctx, width } = setupCanvasHiDPI(canvas, height);
    ctx.clearRect(0, 0, width, height);
    if (itens.length === 0) return;

    const larguraRotulo = Math.min(120, width * 0.35);
    const larguraTrilha = width - larguraRotulo - 46;
    const corTexto = getCSSVar('--text-primary');
    const corTrilha = getCSSVar('--border-default');

    ctx.textBaseline = 'middle';
    ctx.font = '12px Inter, sans-serif';

    itens.forEach((item, i) => {
        const y = i * alturaLinha + alturaLinha / 2;
        const alturaBarra = 10;
        const yBarra = y - alturaBarra / 2;

        ctx.fillStyle = corTexto;
        ctx.textAlign = 'left';
        let nome = item.label;
        while (ctx.measureText(nome).width > larguraRotulo - 10 && nome.length > 1) {
            nome = nome.slice(0, -1);
        }
        if (nome !== item.label) nome = nome.slice(0, -1) + '…';
        ctx.fillText(nome, 0, y);

        ctx.fillStyle = corTrilha;
        drawRoundedRect(ctx, larguraRotulo, yBarra, larguraTrilha, alturaBarra, 5);
        ctx.fill();

        const larguraProgresso = (item.value / 100) * larguraTrilha;
        if (larguraProgresso > 0) {
            ctx.fillStyle = item.color;
            drawRoundedRect(ctx, larguraRotulo, yBarra, Math.max(larguraProgresso, 6), alturaBarra, 5);
            ctx.fill();
        }

        ctx.fillStyle = corTexto;
        ctx.textAlign = 'right';
        ctx.fillText(item.value + '%', width, y);
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
    const history = getContributions();

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

function initDisciplinas() {
    const btnNewDisciplina = document.getElementById('btn-new-disciplina');
    const modal = document.getElementById('modal-disciplina');
    const closeModalBtns = document.querySelectorAll('.close-modal-btn');
    const formDisciplina = document.getElementById('form-disciplina');

    btnNewDisciplina.addEventListener('click', () => {
        modal.classList.add('active');
        document.getElementById('disciplina-nome').focus();
    });

    const closeModal = () => { modal.classList.remove('active'); formDisciplina.reset(); };
    closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

    formDisciplina.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('disciplina-nome').value.trim();
        const cor = document.getElementById('disciplina-cor').value;

        if (!nome) return;

        state.disciplinas.push({ id: 'disc_' + Date.now(), nome: nome, cor: cor, progresso: 0, qtdAssuntos: 0, assuntos: [] });
        saveStateAndRefresh();
        renderDisciplinas();
        closeModal();
    });

    renderDisciplinas();
}

function initAssuntos() {
    const btnBack = document.getElementById('btn-back-disciplinas');
    const formAssunto = document.getElementById('form-assunto');
    const btnDeleteDisciplinaAtual = document.getElementById('btn-delete-disciplina-atual');

    btnBack.addEventListener('click', showDisciplinasMainList);

    btnDeleteDisciplinaAtual.addEventListener('click', () => {
        if (state.currentDisciplinaId) deleteDisciplina(state.currentDisciplinaId);
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
    const btnImport = document.getElementById('btn-import-edital');
    const modalImport = document.getElementById('modal-importacao');
    const closeImportBtns = document.querySelectorAll('.close-import-btn');
    const formImport = document.getElementById('form-importacao');
    const importText = document.getElementById('import-text');

    btnImport.addEventListener('click', () => { modalImport.classList.add('active'); importText.focus(); });
    const closeImportModal = () => { modalImport.classList.remove('active'); formImport.reset(); };
    closeImportBtns.forEach(btn => btn.addEventListener('click', closeImportModal));

    formImport.addEventListener('submit', (e) => {
        e.preventDefault();
        const rawText = importText.value;
        if (!rawText.trim()) return;

        const blocos = rawText.split(/\n\s*\n/);
        let timestampOffset = 0;

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
            }

            assuntosDaMateria.forEach(tituloAssunto => {
                disciplina.assuntos.push({ id: 'item_' + (Date.now() + timestampOffset++), titulo: tituloAssunto, concluido: false, filhos: [] });
            });

            recalcularDisciplina(disciplina);
        });

        saveStateAndRefresh();
        renderDisciplinas();
        closeImportModal();
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
                <div class="search-result-item" onclick="goToSearchTarget('${item.disciplinaId}')">
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
}
// Exposta em window: é chamada via onclick inline no card, e em módulos ES
// as funções não viram globais automaticamente.
window.openDisciplinaDetalhes = openDisciplinaDetalhes;

function showDisciplinasMainList() {
    state.currentDisciplinaId = null;
    document.getElementById('disciplina-detalhes-container').classList.add('hidden');
    document.getElementById('disciplinas-list-container').classList.remove('hidden');
    renderDisciplinas();
}

function deleteDisciplina(id) {
    const disciplina = state.disciplinas.find(d => d.id === id);
    if (!disciplina) return;

    const mensagem = disciplina.qtdAssuntos > 0
        ? `Excluir a disciplina "${disciplina.nome}" e todos os seus ${disciplina.qtdAssuntos} assunto(s)? Essa ação não pode ser desfeita.`
        : `Excluir a disciplina "${disciplina.nome}"? Essa ação não pode ser desfeita.`;
    if (!confirm(mensagem)) return;

    state.disciplinas = state.disciplinas.filter(d => d.id !== id);
    saveStateAndRefresh();

    // Se a disciplina excluída era a que estava aberta, volta pra lista principal
    if (state.currentDisciplinaId === id) {
        showDisciplinasMainList();
    } else {
        renderDisciplinas();
    }
}
// Exposta em window: chamada via onclick inline no card e no botão de exclusão.
window.deleteDisciplina = deleteDisciplina;

window.promptAddSubItem = function(event, paiId) {
    event.stopPropagation();
    event.preventDefault();

    const subTitulo = prompt("Digite o nome do sub-assunto ou grupo:");
    if (!subTitulo || !subTitulo.trim()) return;

    const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
    if (!disciplina) return;

    const encontrarENserir = (itens) => {
        for (let item of itens) {
            if (item.id === paiId) {
                item.filhos.push({ id: 'item_' + Date.now(), titulo: subTitulo.trim(), concluido: false, filhos: [] });
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
};

window.toggleTreeItem = function(id) {
    const d = state.disciplinas.find(disc => disc.id === state.currentDisciplinaId);
    if (!d) return;

    const todayStr = getLocalYYYYMMDD();

    const alternarStatus = (itens) => {
        for (let item of itens) {
            if (item.id === id) {
                item.concluido = !item.concluido;
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
};

window.deleteTreeItem = function(event, id) {
    event.stopPropagation();
    event.preventDefault();

    const disciplina = state.disciplinas.find(d => d.id === state.currentDisciplinaId);
    if (!disciplina) return;

    // Localiza o item primeiro só pra saber o título e se ele tem filhos,
    // e montar uma confirmação mais clara antes de remover de fato.
    let itemEncontrado = null;
    const buscar = (itens) => {
        for (const item of itens) {
            if (item.id === id) { itemEncontrado = item; return true; }
            if (item.filhos && item.filhos.length > 0 && buscar(item.filhos)) return true;
        }
        return false;
    };
    buscar(disciplina.assuntos);
    if (!itemEncontrado) return;

    const temFilhos = itemEncontrado.filhos && itemEncontrado.filhos.length > 0;
    const mensagem = temFilhos
        ? `Excluir "${itemEncontrado.titulo}" e todos os seus sub-assuntos? Essa ação não pode ser desfeita.`
        : `Excluir "${itemEncontrado.titulo}"? Essa ação não pode ser desfeita.`;
    if (!confirm(mensagem)) return;

    const removerDoNivel = (itens) => {
        const idx = itens.findIndex(i => i.id === id);
        if (idx !== -1) { itens.splice(idx, 1); return true; }
        for (const item of itens) {
            if (item.filhos && item.filhos.length > 0 && removerDoNivel(item.filhos)) return true;
        }
        return false;
    };
    removerDoNivel(disciplina.assuntos);

    recalcularDisciplina(disciplina);
    saveStateAndRefresh();
    renderTree();
};

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

function renderDisciplinas() {
    const grid = document.getElementById('disciplinas-grid');
    if (!grid) return;

    if (state.disciplinas.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>Nenhuma disciplina cadastrada ainda.</p></div>`;
        return;
    }

    grid.innerHTML = state.disciplinas.map(disc => `
        <div class="card disciplina-card" style="border-left-color: ${disc.cor}" onclick="openDisciplinaDetalhes('${disc.id}')">
            <button class="btn-delete-icon disciplina-delete-btn" onclick="event.stopPropagation(); deleteDisciplina('${disc.id}')" aria-label="Excluir disciplina" title="Excluir disciplina">🗑</button>
            <h3>${escapeHTML(disc.nome)}</h3>
            <div class="disciplina-meta">
                <span>Assuntos: <strong>${disc.qtdAssuntos}</strong></span>
                <span>Progresso: <strong>${disc.progresso}%</strong></span>
            </div>
            <div class="progress-container"><div class="progress-bar" style="width: ${disc.progresso}%; background-color: ${disc.cor}"></div></div>
        </div>
    `).join('');
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
                <div class="tree-node">
                    <details class="tree-details" open>
                        <summary class="tree-summary">
                            <div class="summary-content">
                                <span class="summary-toggle-icon">▶</span>
                                <input type="checkbox" class="assunto-checkbox" ${item.concluido ? 'checked' : ''} onclick="event.stopPropagation(); toggleTreeItem('${item.id}')">
                                <span style="text-decoration: ${item.concluido ? 'line-through' : 'none'}; opacity: ${item.concluido ? 0.6 : 1}">${escapeHTML(item.titulo)}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                <span class="node-badge ${pctLocal === 100 ? 'concluido' : ''}">${pctLocal}%</span>
                                <button class="btn-add-sub" onclick="promptAddSubItem(event, '${item.id}')" title="Adicionar sub-assunto">+</button>
                                <button class="btn-delete-item" onclick="deleteTreeItem(event, '${item.id}')" title="Excluir">🗑</button>
                            </div>
                        </summary>
                        <div class="tree-children">${item.filhos.map(gerarHTMLNo).join('')}</div>
                    </details>
                </div>
            `;
        } else {
            return `
                <div class="tree-leaf ${item.concluido ? 'concluido' : ''}">
                    <input type="checkbox" class="assunto-checkbox" id="${item.id}" ${item.concluido ? 'checked' : ''} onclick="toggleTreeItem('${item.id}')">
                    <label for="${item.id}">${escapeHTML(item.titulo)}</label>
                    <button class="btn-add-sub" onclick="promptAddSubItem(event, '${item.id}')" title="Adicionar sub-assunto">+</button>
                    <button class="btn-delete-item" onclick="deleteTreeItem(event, '${item.id}')" title="Excluir">🗑</button>
                </div>
            `;
        }
    };

    container.innerHTML = disciplina.assuntos.map(gerarHTMLNo).join('');
}

window.goToSearchTarget = function(disciplinaId) {
    document.getElementById('global-search').value = '';
    document.getElementById('search-results').classList.add('hidden');
    const btnNav = document.querySelector('.nav-link[data-target="disciplinas"]');
    if (btnNav) btnNav.click();
    openDisciplinaDetalhes(disciplinaId);
};

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}