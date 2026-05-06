'use strict';

/* ================================================================
   profesor.js — Lógica del panel del Profesor
   ================================================================ */

// ── Constantes de motivos ─────────────────────────────────────────
const MOTIVOS = {
    FALTAS:      'Faltas',
    CONDUCTA:    'Conducta',
    RENDIMIENTO: 'Rendimiento',
    DOCUMENTOS:  'Documentos',
    REUNION:     'Reunión',
    OTRO:        'Otro',
};

const ASISTENCIA_LABELS = {
    PENDIENTE:   'Pendiente',
    ASISTIO:     'Asistió',
    NO_ASISTIO:  'No asistió',
    ATRASO:      'Atraso',
    VENCIDA:     'Vencida',
    ANULADA:     'Anulada',
};

const ASISTENCIA_BADGES = {
    PENDIENTE:  'badge--warning',
    ASISTIO:    'badge--success',
    NO_ASISTIO: 'badge--error',
    ATRASO:     'badge--warning',
    VENCIDA:    'badge--neutral',
    ANULADA:    'badge--neutral',
};

// ── Estado local ──────────────────────────────────────────────────
let _cursos = [];

// ── Estado citaciones / comunicados ──────────────────────────────
let _todasCitaciones  = [];
let _todosComunicados = [];
let _citMesObj        = null;   // { year, month } — se inicializa en _initCitaciones
let _comMesObj        = null;
let _citFiltroAnulado = 'ACTIVO';
let _comFiltroAnulado = 'ACTIVO';
let _citPage          = 0;
const _CIT_PER_PAGE   = 10;
let _comPage          = 0;
const _COM_PER_PAGE   = 10;
let _marcarCitId      = null;
let _anularCitId      = null;
let _anularComId      = null;

// ── Inicialización ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _initSidebar();
    _initLogout();
    _initUserInfo();
    _initTabs();
    _initCitaciones();
    _initCitacionForm();
    _initPlanForm();
    _initPrimerIngreso();
    cargarCursos();
    if (document.getElementById('notasClasesGrid')) {
        cargarAsignacionesNotas();
        _cargarUltimaCarga();
        _initHistorialBtn();
    }
    _verificarDotPlan();
    // Modo páginas separadas: cargar datos de la sección activa directamente
    if (!document.querySelector('.tab-panel')) {
        if (document.getElementById('secTitleCitProf')) { cargarCitaciones(); cargarComunicados(); }
        if (document.getElementById('ptwPrevMes'))       cargarPlanes();
        if (document.getElementById('perfilAvatar'))     _initCuentaTab();
    }
});

// ── Tabs ──────────────────────────────────────────────────────────
const _TABS    = ['panelNotas', 'panelCitaciones', 'panelPlan', 'panelCuenta'];
const _TAB_BTNS = {
    panelNotas:      'sideNotas',
    panelCitaciones: 'sideCitaciones',
    panelPlan:       'sidePlan',
    panelCuenta:     'sideCuenta',
};

function _activarTab(panelId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    _TABS.forEach(id => {
        const btn = document.getElementById(_TAB_BTNS[id]);
        if (btn) btn.classList.toggle('active', id === panelId);
    });
    if (panelId === 'panelCitaciones') { cargarCitaciones(); cargarComunicados(); }
    if (panelId === 'panelPlan')       cargarPlanes();
    if (panelId === 'panelCuenta')     _initCuentaTab();
}

function _initTabs() {
    const isSPA = !!document.querySelector('.tab-panel');

    if (isSPA) {
        // Modo SPA (dashboard.html): los botones cambian de panel
        document.getElementById('sideNotas')?.addEventListener('click',      () => _activarTab('panelNotas'));
        document.getElementById('sideCitaciones')?.addEventListener('click', () => _activarTab('panelCitaciones'));
        document.getElementById('sidePlan')?.addEventListener('click',       () => _activarTab('panelPlan'));
        document.getElementById('sideCuenta')?.addEventListener('click',     () => _activarTab('panelCuenta'));
        // Activar tab según hash de URL
        const _HASH_TAB = { '#citaciones': 'panelCitaciones', '#plan': 'panelPlan', '#cuenta': 'panelCuenta' };
        const tabInicial = _HASH_TAB[window.location.hash] || 'panelNotas';
        if (tabInicial !== 'panelNotas') _activarTab(tabInicial);
    } else {
        // Modo páginas separadas: los botones navegan a otras URLs
        document.getElementById('sideNotas')?.addEventListener('click',      () => window.location.href = '/profesor/');
        document.getElementById('sideCitaciones')?.addEventListener('click', () => window.location.href = '/profesor/citaciones/');
        document.getElementById('sidePlan')?.addEventListener('click',       () => window.location.href = '/profesor/plan/');
        document.getElementById('sideCuenta')?.addEventListener('click',     () => window.location.href = '/profesor/cuenta/');
    }
}

// ── Citaciones/Comunicados — inicialización completa ─────────────
function _initCitaciones() {
    const secCit     = document.getElementById('secTitleCitProf');
    const secCom     = document.getElementById('secTitleComProf');
    const search     = document.getElementById('searchInputProf');
    const btnCit     = document.getElementById('btnToggleCitProf');
    const btnCom     = document.getElementById('btnToggleComProf');
    const stats      = document.getElementById('statsRowProf');
    const secCitCard = document.getElementById('sectionCitCardProf');
    const secComCard = document.getElementById('sectionComCardProf');
    if (!secCit) return;

    const ahora = new Date();
    _citMesObj  = { year: ahora.getFullYear(), month: ahora.getMonth() };
    _comMesObj  = { year: ahora.getFullYear(), month: ahora.getMonth() };

    const fmtMes = ({ year, month }) =>
        new Date(year, month, 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });

    const _setSec = (sec) => {
        const esCit = sec === 'cit';
        secCit.classList.toggle('sec-title--active', esCit);
        secCom.classList.toggle('sec-title--active', !esCit);
        stats.style.display      = esCit ? 'grid' : 'none';
        secCitCard.style.display = esCit ? 'block' : 'none';
        secComCard.style.display = esCit ? 'none' : 'block';
        btnCit.style.display     = esCit ? 'inline-flex' : 'none';
        btnCom.style.display     = esCit ? 'none' : 'inline-flex';
        search.placeholder     = esCit
            ? 'Buscar por nombre del estudiante...'
            : 'Buscar por título del comunicado...';
    };

    // ── Navegación de mes para citaciones ──
    const prevCit = document.getElementById('btnMesPrevProf');
    const nextCit = document.getElementById('btnMesNextProf');
    const lblCit  = document.getElementById('citMesLabelProf');
    const _paintCitMes = () => {
        lblCit.textContent  = fmtMes(_citMesObj);
        prevCit.disabled    = (_citMesObj.year <= 2026 && _citMesObj.month === 0);
        nextCit.disabled    = (_citMesObj.year === ahora.getFullYear() && _citMesObj.month >= ahora.getMonth());
    };
    prevCit.addEventListener('click', () => {
        if (_citMesObj.month === 0) { _citMesObj.year--; _citMesObj.month = 11; }
        else { _citMesObj.month--; }
        _paintCitMes();
        _aplicarFiltroCit();
    });
    nextCit.addEventListener('click', () => {
        if (_citMesObj.year === ahora.getFullYear() && _citMesObj.month >= ahora.getMonth()) return;
        if (_citMesObj.month === 11) { _citMesObj.year++; _citMesObj.month = 0; }
        else { _citMesObj.month++; }
        _paintCitMes();
        _aplicarFiltroCit();
    });
    _paintCitMes();

    // ── Navegación de mes para comunicados ──
    const prevCom = document.getElementById('btnComMesPrevProf');
    const nextCom = document.getElementById('btnComMesNextProf');
    const lblCom  = document.getElementById('comMesLabelProf');
    const _paintComMes = () => {
        lblCom.textContent  = fmtMes(_comMesObj);
        prevCom.disabled    = (_comMesObj.year <= 2026 && _comMesObj.month === 0);
        nextCom.disabled    = (_comMesObj.year === ahora.getFullYear() && _comMesObj.month >= ahora.getMonth());
    };
    prevCom.addEventListener('click', () => {
        if (_comMesObj.month === 0) { _comMesObj.year--; _comMesObj.month = 11; }
        else { _comMesObj.month--; }
        _paintComMes();
        _aplicarFiltroCom();
    });
    nextCom.addEventListener('click', () => {
        if (_comMesObj.year === ahora.getFullYear() && _comMesObj.month >= ahora.getMonth()) return;
        if (_comMesObj.month === 11) { _comMesObj.year++; _comMesObj.month = 0; }
        else { _comMesObj.month++; }
        _paintComMes();
        _aplicarFiltroCom();
    });
    _paintComMes();

    // ── Chips ACTIVO/ANULADA — citaciones ──
    document.getElementById('estadoChipsCitProf')?.addEventListener('click', e => {
        const chip = e.target.closest('.rol-chip');
        if (!chip) return;
        document.getElementById('estadoChipsCitProf').querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
        chip.classList.add('rol-chip--active');
        _citFiltroAnulado = chip.dataset.estado;
        _citPage = 0;
        _aplicarFiltroCit();
    });

    // ── Chips ACTIVO/ANULADO — comunicados ──
    document.getElementById('estadoChipsComProf')?.addEventListener('click', e => {
        const chip = e.target.closest('.rol-chip');
        if (!chip) return;
        document.getElementById('estadoChipsComProf').querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
        chip.classList.add('rol-chip--active');
        _comFiltroAnulado = chip.dataset.estado;
        _comPage = 0;
        _aplicarFiltroCom();
    });

    // ── Búsqueda con debounce ──
    let _searchTimer;
    search.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
            if (secCitCard.style.display !== 'none') {
                _citPage = 0;
                _aplicarFiltroCit();
            } else {
                _aplicarFiltroCom();
            }
        }, 280);
    });

    // ── Toggle de sección ──
    secCit.addEventListener('click', () => _setSec('cit'));
    secCom.addEventListener('click', () => _setSec('com'));

    // ── Botones de acción ──
    btnCit.addEventListener('click', () => {
        btnCit.classList.add('is-open');
        setTimeout(() => btnCit.classList.remove('is-open'), 180);
        _abrirModalNuevaCitProf();
    });
    btnCom.addEventListener('click', () => {
        btnCom.classList.add('is-open');
        setTimeout(() => btnCom.classList.remove('is-open'), 180);
        _abrirModalNuevoComunicadoProf();
    });

    _setSec('cit');
    _initComunicadoForm();
    _initDetalleCitModals();
}

// ── Sidebar (hamburguesa) ─────────────────────────────────────────
function _initSidebar() {
    const sidebar  = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const btnMenu  = document.getElementById('btnMenu');

    const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;

    let _leaveTimer;
    sidebar.addEventListener('mouseenter', () => {
        clearTimeout(_leaveTimer);
        if (isDesktop()) sidebar.classList.add('sidebar--expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
        if (isDesktop())
            _leaveTimer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200);
    });

    document.addEventListener('mousemove', function _check(e) {
        document.removeEventListener('mousemove', _check);
        if (!isDesktop()) return;
        const r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top  && e.clientY <= r.bottom) {
            sidebar.classList.add('sidebar--expanded');
        }
    });

    function openSidebar()  { sidebar.classList.add('sidebar--open');    backdrop.classList.add('visible'); }
    function closeSidebar() { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); }

    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()
    );
    backdrop.addEventListener('click', closeSidebar);
}

// ── Logout ────────────────────────────────────────────────────────
function _initLogout() {
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });
}

// ── Info del usuario en sidebar ───────────────────────────────────
function _getProfesorHeaderName(user) {
    if (!user) return 'Profesor';
    const primerNombre = (user.first_name || '').trim().split(/\s+/).filter(Boolean)[0] || '';
    const apellidos = (user.last_name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    const nombreCorto = [primerNombre, apellidos].filter(Boolean).join(' ').trim();
    return nombreCorto || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Profesor';
}

function _initUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;
    const nombre = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    const nombreHeader = _getProfesorHeaderName(user);
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    if (pageTitle) pageTitle.textContent = `Panel de ${nombreHeader}`;
    if (pageSubtitle) pageSubtitle.textContent = user.tipo_usuario || 'Profesor';
    document.getElementById('profileName').textContent = "Republica de Francia 'A'";
    document.getElementById('profileRole').textContent = user.tipo_usuario || 'Profesor';
}



// ── Zona horaria Bolivia (UTC-4, sin DST) ─────────────────────────
function _mesBolivia() {
    return new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/La_Paz' })
    ).getMonth() + 1; // 1-based
}

function _anioBolivia() {
    return new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/La_Paz' })
    ).getFullYear();
}

const _MESES_LABEL = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── Cargar asignaciones para el panel de Notas ────────────────────
async function cargarAsignacionesNotas() {
    const grid      = document.getElementById('notasClasesGrid');
    const countEl   = document.getElementById('notasMateriasCount');
    const periodLbl = document.getElementById('notasPeriodLabel');
    const mesPill   = document.getElementById('notasMesPill');

    const mes  = _mesBolivia();
    const anio = _anioBolivia();

    // Actualizar pill de mes
    if (mesPill) mesPill.textContent = `${_MESES_LABEL[mes]} ${anio}`.toUpperCase();
    if (periodLbl) periodLbl.textContent = _MESES_LABEL[mes];

    // Mostrar spinner mientras se cargan los datos
    grid.innerHTML = `
        <div class="notas-loading">
            <div class="notas-loading__spinner"></div>
            <p>Cargando asignaciones...</p>
        </div>`;
    if (countEl) countEl.innerHTML = '';

    const token   = localStorage.getItem('access_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    // Ambas peticiones en paralelo: asignaciones + estado de notas del mes
    const [asignResult, estadoResult] = await Promise.allSettled([
        fetch(`/api/academics/profesor/mis-asignaciones/?mes=${mes}`, { headers }),
        fetch(`/api/academics/profesor/notas-estado-mes/?mes=${mes}`, { headers }),
    ]);

    let data = [];
    if (asignResult.status === 'fulfilled' && asignResult.value.ok) {
        try { data = await asignResult.value.json(); } catch { data = []; }
    }

    const pcSubidas = new Set();
    if (estadoResult.status === 'fulfilled' && estadoResult.value.ok) {
        try {
            const estadoData = await estadoResult.value.json();
            (estadoData.pc_ids_con_notas || []).forEach(id => pcSubidas.add(String(id)));
        } catch { /* silencioso */ }
    }

    if (!Array.isArray(data) || !data.length) {
        grid.innerHTML = `<div class="notas-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 9h6M9 13h6M9 17h4"/>
            </svg>
            <p>No tienes asignaciones registradas.</p>
        </div>`;
        return;
    }

    // Indicador de progreso
    const cargadas   = data.filter(a => pcSubidas.has(String(a.id))).length;
    const pendientes = data.length - cargadas;
    if (countEl) {
        countEl.innerHTML =
            `<span class="notas-prog__cargadas">${cargadas} cargada${cargadas !== 1 ? 's' : ''}</span>` +
            `<span class="notas-prog__sep"> · </span>` +
            `<span class="notas-prog__pendientes">${pendientes} pendiente${pendientes !== 1 ? 's' : ''}</span>`;
    }

    const _svgBook = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`;
    const _svgChevron = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
    </svg>`;

    // Renderizar todas las tarjetas con estado ya conocido (sin segunda pasada)
    grid.innerHTML = data.map(a => {
        const yaSubidas = pcSubidas.has(String(a.id));
        const badge     = yaSubidas
            ? `<span class="notas-subido-badge">✓ Notas cargadas</span>`
            : '';
        const btnLabel  = yaSubidas ? 'Ver notas' : 'Gestionar';
        return `
        <div class="notas-clase-card${yaSubidas ? ' notas-clase-card--subido' : ''}">
            <div class="notas-clase-card__band"></div>
            <div class="notas-clase-card__body">
                <div class="notas-clase-card__top">
                    <span class="notas-clase-card__curso-tag">${_escapeHtml(a.materia_nombre)}</span>
                    <div class="notas-clase-card__top-right">
                        ${badge}
                        <span class="notas-clase-card__icon">${_svgBook}</span>
                    </div>
                </div>
                <p class="notas-clase-card__materia">${_escapeHtml(a.curso_nombre)}</p>
                <div class="notas-clase-card__footer">
                    <button class="notas-clase-card__btn"
                            data-pc-id="${a.id}"
                            data-label="${_escapeHtml(a.materia_nombre)} — ${_escapeHtml(a.curso_nombre)}"
                            data-materia="${_escapeHtml(a.materia_nombre)}"
                            data-curso="${_escapeHtml(a.curso_nombre)}"
                            data-mes="${mes}"
                            data-ya-subidas="${yaSubidas ? '1' : '0'}">
                        ${_svgChevron}
                        ${btnLabel}
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.notas-clase-card__btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _irASubirNotas(
                btn.dataset.pcId, btn.dataset.label,
                btn.dataset.mes, btn.dataset.materia, btn.dataset.curso,
                btn.dataset.yaSubidas === '1',
            );
        });
    });
}

// ── Historial de cargas: dropdown de meses ────────────────────────
let _historialCargado = false;

function _initHistorialBtn() {
    const btn   = document.getElementById('btnVerHistorial');
    const panel = document.getElementById('notasHistorialPanel');
    if (!btn || !panel) return;

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const abierto = !panel.hidden;
        if (abierto) { panel.hidden = true; return; }

        panel.hidden = false;
        if (_historialCargado) return;

        // Primera vez: fetch al servidor
        _historialCargado = true;
        const inner = document.getElementById('notasHistorialInner');
        inner.innerHTML = `
            <div class="notas-historial-spinner">
                <div class="notas-loading__spinner" style="width:22px;height:22px;border-width:2.5px;"></div>
                <span>Cargando historial...</span>
            </div>`;

        try {
            const token = localStorage.getItem('access_token');
            const res   = await fetch('/api/academics/profesor/historial-meses/', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            const { meses } = await res.json();
            _renderHistorialMeses(meses, inner);
        } catch {
            inner.innerHTML = `<p style="padding:14px 18px;color:var(--text-muted);font-size:.82rem;">No se pudo cargar el historial.</p>`;
        }
    });

    // Cerrar al clicar fuera
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('notasHistorialWrap');
        if (wrap && !wrap.contains(e.target)) panel.hidden = true;
    });
}

const _MESES_NOMBRE = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function _renderHistorialMeses(meses, inner) {
    if (!meses || !meses.length) {
        inner.innerHTML = `<p style="padding:14px 18px;color:var(--text-muted);font-size:.82rem;">No hay cargas registradas aún.</p>`;
        return;
    }

    inner.innerHTML = meses.map(m => {
        const esSinDatos = m.estado === 'sin_datos';
        const claseItem  = esSinDatos ? 'notas-hist-mes notas-hist-mes--sin_datos' : 'notas-hist-mes';
        const claseDot   = `notas-hist-mes__dot notas-hist-mes__dot--${m.estado}`;
        const sub        = esSinDatos
            ? 'Sin datos'
            : `${m.con_notas} de ${m.total} cursos`;
        return `
        <button class="${claseItem}" data-mes="${m.mes}" data-estado="${m.estado}" ${esSinDatos ? 'disabled' : ''}>
            <span class="${claseDot}"></span>
            <span class="notas-hist-mes__nombre">${_MESES_NOMBRE[m.mes]}</span>
            <span class="notas-hist-mes__sub">${sub}</span>
        </button>`;
    }).join('');

    inner.querySelectorAll('.notas-hist-mes:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('notasHistorialPanel').hidden = true;
            _cargarVistaHistorialMes(parseInt(btn.dataset.mes));
        });
    });
}

async function _cargarVistaHistorialMes(mes) {
    const grid      = document.getElementById('notasClasesGrid');
    const countEl   = document.getElementById('notasMateriasCount');
    const periodLbl = document.getElementById('notasPeriodLabel');
    const mesPill   = document.getElementById('notasMesPill');

    if (mesPill)   mesPill.textContent  = `${_MESES_NOMBRE[mes]} ${_anioBolivia()} — Historial`.toUpperCase();
    if (periodLbl) periodLbl.textContent = _MESES_NOMBRE[mes];
    if (countEl)   countEl.innerHTML    = '';

    grid.innerHTML = `
        <div class="notas-loading">
            <div class="notas-loading__spinner"></div>
            <p>Cargando asignaciones de ${_MESES_NOMBRE[mes]}...</p>
        </div>`;

    try {
        const token = localStorage.getItem('access_token');
        const res   = await fetch(`/api/academics/profesor/asignaciones-historial-mes/?mes=${mes}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        _renderGridHistorial(data, mes, countEl, grid);
    } catch {
        grid.innerHTML = `<div class="notas-empty"><p>Error al cargar el historial.</p></div>`;
    }
}

function _renderGridHistorial(data, mes, countEl, grid) {
    if (!Array.isArray(data) || !data.length) {
        grid.innerHTML = `<div class="notas-empty"><p>Sin asignaciones registradas.</p></div>`;
        return;
    }
    const conNotas  = data.filter(a => a.tiene_notas).length;
    const sinNotas  = data.length - conNotas;
    if (countEl) {
        countEl.innerHTML =
            `<span class="notas-prog__cargadas">${conNotas} con notas</span>` +
            `<span class="notas-prog__sep"> · </span>` +
            `<span class="notas-prog__pendientes">${sinNotas} sin datos</span>`;
    }

    const _svgBook = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>`;
    const _svgClock = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>`;
    const _svgChevron = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
    </svg>`;

    grid.innerHTML = data.map(a => {
        if (!a.tiene_notas) {
            return `
            <div class="notas-clase-card notas-clase-card--disabled">
                <div class="notas-clase-card__band"></div>
                <div class="notas-clase-card__body">
                    <div class="notas-clase-card__top">
                        <span class="notas-clase-card__curso-tag">${_escapeHtml(a.materia_nombre)}</span>
                        <span class="notas-clase-card__icon">${_svgBook}</span>
                    </div>
                    <p class="notas-clase-card__materia">${_escapeHtml(a.curso_nombre)}</p>
                    <div class="notas-clase-card__footer">
                        <span style="font-size:.72rem;color:var(--text-muted);">Sin datos en ${_MESES_NOMBRE[mes]}</span>
                    </div>
                </div>
            </div>`;
        }
        return `
        <div class="notas-clase-card notas-clase-card--subido">
            <div class="notas-clase-card__band"></div>
            <div class="notas-clase-card__body">
                <div class="notas-clase-card__top">
                    <span class="notas-clase-card__curso-tag">${_escapeHtml(a.materia_nombre)}</span>
                    <div class="notas-clase-card__top-right">
                        <span class="notas-subido-badge">✓ Cargado</span>
                        <span class="notas-clase-card__icon">${_svgBook}</span>
                    </div>
                </div>
                <p class="notas-clase-card__materia">${_escapeHtml(a.curso_nombre)}</p>
                <span class="notas-card-fecha">${_svgClock} Cargado el ${_escapeHtml(a.fecha_carga)}</span>
                <div class="notas-clase-card__footer">
                    <button class="notas-clase-card__btn"
                            data-pc-id="${a.id}"
                            data-label="${_escapeHtml(a.materia_nombre)} — ${_escapeHtml(a.curso_nombre)}"
                            data-materia="${_escapeHtml(a.materia_nombre)}"
                            data-curso="${_escapeHtml(a.curso_nombre)}"
                            data-mes="${mes}">
                        ${_svgChevron}
                        Ver notas
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.notas-clase-card__btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = new URLSearchParams({
                pc_id:     btn.dataset.pcId,
                label:     btn.dataset.label,
                materia:   btn.dataset.materia,
                curso:     btn.dataset.curso,
                mes_hasta: btn.dataset.mes,
                modo:      'historial',
            });
            window.location.href = `/profesor/calificaciones/?${q.toString()}`;
        });
    });
}

// ── Cargar fecha de última subida de notas ────────────────────────
async function _cargarUltimaCarga() {
    const fechaEl = document.getElementById('notasUltimaCargaFecha');
    const btnEl   = document.getElementById('btnVerHistorial');
    if (!fechaEl) return;

    try {
        const token = localStorage.getItem('access_token');
        const res   = await fetch('/api/academics/profesor/ultima-carga/', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) { fechaEl.textContent = 'Sin datos'; return; }
        const { fecha_carga } = await res.json();
        if (fecha_carga) {
            fechaEl.textContent = fecha_carga;
            if (btnEl) btnEl.disabled = false;
        } else {
            fechaEl.textContent = 'Sin datos';
        }
    } catch {
        fechaEl.textContent = 'Sin datos';
    }
}


function _irASubirNotas(pcId, label, mes = '', materia = '', curso = '', yaSubidas = false) {
    const q = new URLSearchParams({
        pc_id:      pcId,
        label:      label,
        mes:        mes,
        materia:    materia,
        curso:      curso,
        ya_subidas: yaSubidas ? '1' : '0',
    });
    window.location.href = `/profesor/calificaciones/?${q.toString()}`;
}

// ── Modal nueva citación: abrir / cerrar ──────────────────────────
function _abrirModalNuevaCitProf() {
    document.getElementById('modalNuevaCitacionProf').classList.add('visible');
}

function _cerrarModalNuevaCitProf() {
    const modal = document.getElementById('modalNuevaCitacionProf');
    modal.classList.remove('visible');
    document.getElementById('formCitacion').reset();
    document.getElementById('citEstudiante').disabled = true;
    document.getElementById('citError').style.display = 'none';
}

// ── Formulario de nueva citación ──────────────────────────────────
function _initCitacionForm() {
    const selectCurso = document.getElementById('citCurso');
    if (!selectCurso) return;
    const selectEst   = document.getElementById('citEstudiante');

    // No permitir fechas pasadas en la fecha límite de citación
    const inputFechaLimite = document.getElementById('citFechaLimite');
    inputFechaLimite.min = new Date().toISOString().split('T')[0];

    selectCurso.addEventListener('change', () => {
        const cursoId = selectCurso.value;
        _resetSelect(selectEst, 'Selecciona un estudiante');
        if (!cursoId) return;
        cargarEstudiantes(cursoId);
    });

    document.getElementById('formCitacion').addEventListener('submit', async e => {
        e.preventDefault();
        await enviarCitacion();
    });

    // Cerrar modal al pulsar X, Cancelar o clic fuera
    document.getElementById('btnCerrarModalCitProf').addEventListener('click', _cerrarModalNuevaCitProf);
    document.getElementById('btnCancelarCitProf').addEventListener('click', _cerrarModalNuevaCitProf);
    document.getElementById('modalNuevaCitacionProf').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalNuevaCitProf();
    });
}

function _resetSelect(el, placeholder) {
    el.innerHTML = `<option value="">— ${placeholder} —</option>`;
    el.disabled = true;
}

// ── Cargar cursos del profesor ────────────────────────────────────
async function cargarCursos() {
    const sel = document.getElementById('citCurso');
    if (!sel) return;
    const { ok, data } = await fetchAPI('/api/academics/profesor/cursos/');
    if (!ok) return;

    _cursos = data;
    sel.innerHTML = '<option value="">— Selecciona un curso —</option>';
    data.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.grado} "${c.paralelo}"`;
        sel.appendChild(opt);
    });
    sel.disabled = false;
}

// ── Cargar estudiantes de un curso ────────────────────────────────
async function cargarEstudiantes(cursoId) {
    const { ok, data } = await fetchAPI(`/api/students/curso/${cursoId}/estudiantes/`);
    const sel = document.getElementById('citEstudiante');
    if (!ok) {
        showAppToast('error', 'Error', 'No se pudieron cargar los estudiantes.');
        return;
    }
    sel.innerHTML = '<option value="">— Selecciona un estudiante —</option>';
    const activos = data.filter(e => e.activo !== false);
    activos.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        const nombre = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`;
        if (e.tiene_tutor) {
            opt.textContent = nombre;
        } else {
            opt.textContent = `${nombre} — sin tutor`;
            opt.disabled = true;
            opt.style.color = '#888';
        }
        sel.appendChild(opt);
    });
    sel.disabled = activos.length === 0;
}

// ── Enviar citación ───────────────────────────────────────────────
async function enviarCitacion() {
    const btn = document.getElementById('btnEnviarCitacion');
    const estudianteId  = document.getElementById('citEstudiante').value;
    const motivo        = document.getElementById('citMotivo').value;
    const descripcion   = document.getElementById('citDescripcion').value.trim();
    const fechaLimite   = document.getElementById('citFechaLimite').value;
    const errorEl       = document.getElementById('citError');

    errorEl.style.display = 'none';

    if (!estudianteId || !motivo || !fechaLimite) {
        errorEl.textContent = 'Completa todos los campos obligatorios.';
        errorEl.style.display = 'block';
        return;
    }

    const btnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const { ok, data, status } = await fetchAPI('/api/discipline/citaciones/crear/', {
        method: 'POST',
        body: JSON.stringify({
            estudiante: parseInt(estudianteId),
            motivo,
            descripcion,
            estado: 'ENVIADA',
            fecha_limite_asistencia: fechaLimite,
        }),
    });

    btn.disabled = false;
    btn.innerHTML = btnHtml;

    if (!ok) {
        const msg = data?.errores || data?.estudiante?.[0] || data?.motivo?.[0] || 'Error al crear la citación.';
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        return;
    }

    showAppToast('success', 'Citación enviada', 'La citación fue registrada correctamente.');
    _cerrarModalNuevaCitProf();
    cargarCitaciones();
}

// ── Plan de Trabajo ───────────────────────────────────────────────
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const SVG_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
</svg>`;

// ── Estado del plan ────────────────────────────────────────────────
let _planAsignaciones = [];   // ProfesorCurso[] del profesor
let _planPlanesCache  = {};   // { mes: { pc_id: [plan, ...] } }
let _planMesVista     = new Date().getMonth() + 1;

function _initPlanForm() {
    if (!document.getElementById('ptwPrevMes')) return;
    // Navegación de mes
    document.getElementById('ptwPrevMes').addEventListener('click', async () => {
        if (_planMesVista <= 1) return;
        _planMesVista--;
        await _cambiarMesPlan();
    });
    document.getElementById('ptwNextMes').addEventListener('click', async () => {
        if (_planMesVista >= new Date().getMonth() + 1) return;
        _planMesVista++;
        await _cambiarMesPlan();
    });

    // modal — cerrar
    document.getElementById('planModalClose').addEventListener('click', _cerrarPlanModal);
    document.getElementById('planModalCancelar').addEventListener('click', _cerrarPlanModal);
    document.getElementById('planModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarPlanModal();
    });

    // modal — guardar semana activa
    document.getElementById('planModalGuardar').addEventListener('click', _guardarSemana);

    // advertencia sin guardar
    document.getElementById('warnSinGuardarQuedarme').addEventListener('click', () => {
        document.getElementById('warnSinGuardarOverlay').classList.remove('visible');
    });
    document.getElementById('warnSinGuardarSalir').addEventListener('click', () => {
        document.getElementById('warnSinGuardarOverlay').classList.remove('visible');
        _forzarCerrarPlanModal();
    });
}

function _actualizarHeaderMes() {
    const mesActual = new Date().getMonth() + 1;
    document.getElementById('ptwMesLabel').textContent = `${MESES[_planMesVista]} ${new Date().getFullYear()}`;
    document.getElementById('ptwPrevMes').disabled = _planMesVista <= 1;
    document.getElementById('ptwNextMes').disabled = _planMesVista >= mesActual;
}

async function _cambiarMesPlan() {
    const main    = document.getElementById('ptwMain');
    const spinner = document.getElementById('planSpinner');
    main.style.display    = 'none';
    spinner.style.display = 'flex';
    await _refrescarPlanesCache(_planMesVista);
    spinner.style.display = 'none';
    main.style.display    = 'block';
    _actualizarHeaderMes();
    _renderPlanCards(_planMesVista);
    _actualizarNotificaciones(_planMesVista);
}

// ── Utilidades de calendario ──────────────────────────────────────
function _semanasMes(mes, año) {
    const primerDia = new Date(año, mes - 1, 1);
    const dowLun = (primerDia.getDay() + 6) % 7;
    const diasHastaLunes = (7 - dowLun) % 7;
    return [0, 1, 2, 3].map(i => {
        const lunes  = new Date(año, mes - 1, 1 + diasHastaLunes + i * 7);
        const domingo = new Date(lunes);
        domingo.setDate(domingo.getDate() + 6);
        return { inicio: lunes, fin: domingo };
    });
}

function _periodoSemana(mes, semana) {
    const año = new Date().getFullYear();
    const { inicio, fin } = _semanasMes(mes, año)[semana - 1];
    const fmt = d => {
        const m = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return `${d.getDate()} de ${m[d.getMonth()]}`;
    };
    return { display: `${fmt(inicio)} – ${fmt(fin)}` };
}

// ── Carga principal del mes actual ────────────────────────────────
async function cargarPlanes() {
    const spinner = document.getElementById('planSpinner');
    const main    = document.getElementById('ptwMain');
    main.style.display    = 'none';
    spinner.style.display = 'flex';

    _planMesVista = new Date().getMonth() + 1;

    if (!_planAsignaciones.length) {
        const { ok, data } = await fetchAPI(`/api/academics/profesor/mis-asignaciones/?mes=${_planMesVista}`);
        if (!ok) {
            spinner.style.display = 'none';
            showAppToast('error', 'Error', 'No se pudieron cargar las asignaciones.');
            return;
        }
        _planAsignaciones = data;
    }
    await _refrescarPlanesCache(_planMesVista);

    spinner.style.display = 'none';
    main.style.display    = 'block';
    _actualizarHeaderMes();
    _renderPlanCards(_planMesVista);
    _actualizarNotificaciones(_planMesVista);
}

async function _refrescarPlanesCache(mes) {
    const { ok, data } = await fetchAPI(`/api/academics/profesor/planes/?mes=${mes}`);
    if (!ok) return;
    const pcMap = {};
    _planAsignaciones.forEach(a => { pcMap[a.id] = []; });
    data.forEach(p => { if (pcMap[p.profesor_curso_id] !== undefined) pcMap[p.profesor_curso_id].push(p); });
    _planPlanesCache[mes] = pcMap;
}

// ── Tarjetas de asignaciones ──────────────────────────────────────
function _renderPlanCards(mes) {
    const grid  = document.getElementById('planAsigGrid');
    const pcMap = _planPlanesCache[mes] || {};

    grid.innerHTML = _planAsignaciones.map(asig => {
        const plans    = pcMap[asig.id] || [];
        const complete = plans.length === 4;
        const weeksHtml = [1, 2, 3, 4].map(s => {
            const ok = plans.some(p => p.semana === s);
            return `<div class="ptw-week${ok ? ' ptw-week--filled' : ''}">
                <div class="ptw-week-bar${ok ? ' ptw-week-bar--filled' : ''}"></div>
                <span class="ptw-week-name">Semana ${s}</span>
            </div>`;
        }).join('');

        return `<div class="ptw-card" data-pc-id="${asig.id}" data-mes="${mes}">
            <div>
                <div class="ptw-course">${_escapeHtml(asig.curso_nombre)}</div>
                <div class="ptw-subject">${_escapeHtml(asig.materia_nombre)}</div>
            </div>
            <div>
                <div class="ptw-progress-label">Progreso semanal</div>
                <div class="ptw-weeks">${weeksHtml}</div>
            </div>
            <button class="ptw-btn ${complete ? 'ptw-btn--primary' : 'ptw-btn--ghost'}">
                ${complete ? 'Editar Plan' : 'Definir Plan'}
            </button>
        </div>`;
    }).join('');

    grid.querySelectorAll('.ptw-card').forEach(card => {
        card.addEventListener('click', () =>
            _abrirPlanModal(parseInt(card.dataset.pcId), parseInt(card.dataset.mes))
        );
    });
}

// ── Estado del modal de plan ──────────────────────────────────────
let _pmPcId        = null;   // profesor_curso id
let _pmMes         = null;   // mes del modal
let _pmSemana      = 1;      // semana activa en sidebar
let _pmPlanes      = {};     // { semana: plan_obj } — guardados en BD
let _pmModos       = {};     // { semana: 'view'|'edit'|'new' }
let _pmDrafts      = {};     // { semana: string } — borrador en memoria
let _pmSoloLectura = false;  // true cuando el mes ya pasó

// ── Modal de plan por asignación ──────────────────────────────────
function _abrirPlanModal(pcId, mes) {
    _pmPcId      = pcId;
    _pmMes       = mes;
    _pmSemana    = 1;
    _pmDrafts    = { 1: '', 2: '', 3: '', 4: '' };
    _pmSoloLectura = mes < (new Date().getMonth() + 1);

    const asig   = _planAsignaciones.find(a => a.id === pcId);
    if (!asig) return;

    const planes = (_planPlanesCache[mes] || {})[pcId] || [];
    _pmPlanes = {};
    planes.forEach(p => { _pmPlanes[p.semana] = p; });

    _pmModos = {};
    for (let s = 1; s <= 4; s++) {
        _pmModos[s] = _pmPlanes[s] ? 'view' : 'new';
    }

    document.getElementById('pmTitle').textContent =
        `Planificación Semanal: ${MESES[mes]} ${new Date().getFullYear()}`;

    _renderPmSidebar();
    _renderPmContent();
    document.getElementById('planModalOverlay').classList.add('visible');
}

function _cerrarPlanModal() {
    // Guardar borrador de la semana activa antes de revisar
    _guardarDraftActivo();

    const pendientes = [1, 2, 3, 4].filter(s => _pmDrafts[s].trim().length > 0);
    if (pendientes.length) {
        const nombres = pendientes.map(s => `Semana ${s}`).join(', ');
        document.getElementById('warnSinGuardarMsg').textContent =
            `Tienes contenido sin guardar en ${nombres}. Si cierras ahora, se perderá.`;
        document.getElementById('warnSinGuardarOverlay').classList.add('visible');
        return;
    }
    _forzarCerrarPlanModal();
}

function _forzarCerrarPlanModal() {
    document.getElementById('planModalOverlay').classList.remove('visible');
    _pmPcId = _pmMes = null;
    _pmPlanes = _pmModos = _pmDrafts = {};
}

function _guardarDraftActivo() {
    const ta = document.getElementById('pmTextarea');
    if (ta) _pmDrafts[_pmSemana] = ta.value;
}

// ── Sidebar ───────────────────────────────────────────────────────
const _SVG_CAL_OK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>`;
const _SVG_CAL    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

function _renderPmSidebar() {
    const list = document.getElementById('pmWeekList');
    list.innerHTML = [1, 2, 3, 4].map(s => {
        const saved  = !!_pmPlanes[s];
        const active = s === _pmSemana;
        return `<button class="pm-week-item${active ? ' pm-week-item--active' : ''}" data-s="${s}">
            <span class="pm-week-icon">${saved ? _SVG_CAL_OK : _SVG_CAL}</span>
            <span>Semana ${s}</span>
            ${saved ? '<span class="pm-week-saved-dot"></span>' : ''}
        </button>`;
    }).join('');

    list.querySelectorAll('.pm-week-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = parseInt(btn.dataset.s);
            if (s === _pmSemana) return;
            _guardarDraftActivo();
            _pmSemana = s;
            _renderPmSidebar();
            _renderPmContent();
        });
    });
}

// ── Panel de contenido ────────────────────────────────────────────
function _renderPmContent() {
    const content = document.getElementById('pmContent');
    const btnSave = document.getElementById('planModalGuardar');
    const modo    = _pmModos[_pmSemana];
    const plan    = _pmPlanes[_pmSemana];

    const _ordinal = ['','primera','segunda','tercera','cuarta'];
    const { display: rango } = _periodoSemana(_pmMes, _pmSemana);
    const headerHtml = `
        <div class="pm-content-header">
            <div class="pm-content-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
            </div>
            <div>
                <p class="pm-content-title">${_escapeHtml(rango)}</p>
                <p class="pm-content-sub">Describa las metas curriculares para la ${_ordinal[_pmSemana]} semana de ${MESES[_pmMes]}.</p>
            </div>
        </div>`;

    if (_pmSoloLectura) {
        content.innerHTML = `${headerHtml}
            ${plan
                ? `<div class="pm-readonly-text">${_escapeHtml(plan.descripcion)}</div>`
                : `<div class="pm-readonly-text pm-readonly-text--empty">Sin plan registrado para esta semana.</div>`
            }
            <p class="pm-mes-pasado-msg">No puedes modificar planes de meses pasados.</p>`;
        btnSave.style.display = 'none';
    } else if (modo === 'view') {
        btnSave.style.display = '';
        content.innerHTML = `${headerHtml}
            <div class="pm-readonly-text">${_escapeHtml(plan.descripcion)}</div>`;
        btnSave.textContent = 'Editar';
        btnSave.className   = 'pm-btn-action pm-btn-action--edit';
        btnSave.disabled    = false;
        btnSave.onclick     = () => {
            _pmModos[_pmSemana] = 'edit';
            _pmDrafts[_pmSemana] = plan.descripcion;
            _renderPmContent();
        };
    } else {
        btnSave.style.display = '';
        const draft = _pmDrafts[_pmSemana];
        content.innerHTML = `${headerHtml}
            <textarea class="pm-textarea" id="pmTextarea"
                placeholder="Describa las actividades y objetivos para la semana ${_pmSemana}… (mín. 20 caracteres)"
                maxlength="500">${_escapeHtml(draft)}</textarea>
            <span class="pm-error-msg" id="pmErrorMsg"></span>`;
        btnSave.textContent = 'Guardar Cambios';
        btnSave.className   = 'pm-btn-action pm-btn-action--save';
        btnSave.disabled    = false;
        btnSave.onclick     = null;  // usa el listener global de _initPlanForm
    }
}

// ── Guardar semana activa ─────────────────────────────────────────
async function _guardarSemana() {
    const modo = _pmModos[_pmSemana];
    if (modo === 'view') return;  // botón en modo editar se maneja via onclick

    const ta  = document.getElementById('pmTextarea');
    const err = document.getElementById('pmErrorMsg');
    if (!ta) return;

    const desc = ta.value.trim();
    if (desc.length < 20) {
        ta.classList.add('pm-invalid');
        err.textContent = 'Mínimo 20 caracteres.';
        err.style.display = 'block';
        return;
    }
    ta.classList.remove('pm-invalid');
    if (err) err.style.display = 'none';

    const btn = document.getElementById('planModalGuardar');
    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    let ok, data;
    if (modo === 'new') {
        ({ ok, data } = await fetchAPI('/api/academics/profesor/planes/', {
            method: 'POST',
            body: JSON.stringify({ mes: _pmMes, semana: _pmSemana, descripcion: desc, profesor_curso_id: _pmPcId }),
        }));
    } else {
        ({ ok, data } = await fetchAPI(`/api/academics/profesor/planes/${_pmPlanes[_pmSemana].id}/`, {
            method: 'PATCH',
            body: JSON.stringify({ descripcion: desc }),
        }));
    }

    if (ok) {
        _pmPlanes[_pmSemana]  = data;
        _pmModos[_pmSemana]   = 'view';
        _pmDrafts[_pmSemana]  = '';
        await _refrescarPlanesCache(_pmMes);
        _renderPlanCards(_pmMes);
        _actualizarNotificaciones(_pmMes);
        _renderPmSidebar();
        _renderPmContent();
        showAppToast('success', 'Guardado', `Semana ${_pmSemana} registrada correctamente.`);
    } else {
        btn.disabled    = false;
        btn.textContent = 'Guardar Cambios';
        showAppToast('error', 'Error', data?.errores || 'No se pudo guardar el plan.');
    }
}



// ── Verificación background (dot en sidebar) ──────────────────────
async function _verificarDotPlan() {
    // Necesita asignaciones para saber cuántos se esperan
    const mes = new Date().getMonth() + 1;
    if (!_planAsignaciones.length) {
        const { ok, data } = await fetchAPI(`/api/academics/profesor/mis-asignaciones/?mes=${mes}`);
        if (!ok) return;
        _planAsignaciones = data;
    }
    const { ok, data } = await fetchAPI(`/api/academics/profesor/planes/?mes=${mes}`);
    if (!ok) return;
    // Si alguna asignación tiene < 4 planes → dot visible
    const conteo = {};
    _planAsignaciones.forEach(a => { conteo[a.id] = 0; });
    data.forEach(p => { if (conteo[p.profesor_curso_id] !== undefined) conteo[p.profesor_curso_id]++; });
    const incompleto = _planAsignaciones.some(a => conteo[a.id] < 4);
    document.getElementById('planDot').classList.toggle('visible', incompleto);
}

function _actualizarNotificaciones(mes) {
    const pcMap      = _planPlanesCache[mes] || {};
    const incompleto = _planAsignaciones.some(a => (pcMap[a.id] || []).length < 4);
    document.getElementById('planDot').classList.toggle('visible', incompleto);
}


function _escapeHtml(str) {
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}

// ── Cargar citaciones ─────────────────────────────────────────────
async function cargarCitaciones() {
    const spinner    = document.getElementById('citSpinner');
    const container  = document.getElementById('citTablaWrap');

    if (spinner)   spinner.style.display = 'flex';
    if (container) container.innerHTML = '';

    const { ok, data } = await fetchAPI('/api/discipline/citaciones/');

    if (spinner) spinner.style.display = 'none';

    if (!ok) return;

    _todasCitaciones = data || [];
    _aplicarFiltroCit();
}

function _aplicarFiltroCit() {
    const q = (document.getElementById('searchInputProf')?.value || '').toLowerCase().trim();

    // 1. Filtrar por mes
    let porMes = _todasCitaciones.filter(c => {
        if (!c.fecha_envio) return false;
        const d = new Date(c.fecha_envio);
        return d.getFullYear() === _citMesObj.year && d.getMonth() === _citMesObj.month;
    });

    // 2. Actualizar stats con las activas (no anuladas) del mes
    _actualizarStatsCit(porMes.filter(c => c.asistencia !== 'ANULADA'));

    // 3. Filtrar por ACTIVO/ANULADA
    let filtradas = _citFiltroAnulado === 'ANULADA'
        ? porMes.filter(c => c.asistencia === 'ANULADA')
        : porMes.filter(c => c.asistencia !== 'ANULADA');

    // 4. Filtrar por búsqueda
    if (q) {
        filtradas = filtradas.filter(c =>
            (c.estudiante_nombre || '').toLowerCase().includes(q) ||
            (c.curso || '').toLowerCase().includes(q)
        );
    }

    // 5. Ordenar por fecha límite ascendente
    filtradas.sort((a, b) => {
        const da = a.fecha_limite_asistencia ? new Date(a.fecha_limite_asistencia + 'T00:00:00') : new Date('9999-01-01');
        const db = b.fecha_limite_asistencia ? new Date(b.fecha_limite_asistencia + 'T00:00:00') : new Date('9999-01-01');
        return da - db;
    });

    _renderCitTable(filtradas);
}

function _actualizarStatsCit(citaciones) {
    const stats = document.getElementById('statsRowProf');
    if (!stats) return;
    const counts = { total: citaciones.length, PENDIENTE: 0, NO_ASISTIO: 0, ASISTIO: 0 };
    citaciones.forEach(c => { if (counts[c.asistencia] !== undefined) counts[c.asistencia]++; });
    stats.querySelectorAll('.cit-stat-card').forEach(card => {
        const val = card.querySelector('.cit-stat-card__value');
        if (!val) return;
        const f = card.dataset.filter;
        val.textContent = f === '' ? counts.total : (counts[f] ?? 0);
    });
}

function _renderCitTable(filtradas) {
    const container = document.getElementById('citTablaWrap');
    const footer    = document.getElementById('citGridFooter');
    if (!container) return;

    if (!filtradas.length) {
        container.innerHTML = `<div class="empty-cards">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <p>No hay citaciones registradas en este período.</p>
        </div>`;
        if (footer) footer.innerHTML = '';
        return;
    }

    const total = filtradas.length;
    const pages = Math.ceil(total / _CIT_PER_PAGE);
    if (_citPage >= pages) _citPage = pages - 1;
    const slice = filtradas.slice(_citPage * _CIT_PER_PAGE, (_citPage + 1) * _CIT_PER_PAGE);

    const STATUS_CFG = {
        PENDIENTE:  { cls: 'pendiente',  txt: 'Pendiente'  },
        ASISTIO:    { cls: 'asistio',    txt: 'Asistió'    },
        NO_ASISTIO: { cls: 'no_asistio', txt: 'No asistió' },
        ATRASO:     { cls: 'atraso',     txt: 'Atraso'     },
        ANULADA:    { cls: 'anulada',    txt: 'Anulada'    },
    };

    const fmtFecha = s => s
        ? new Date(s + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })
        : '—';

    container.innerHTML = `
        <div class="cit-table-wrap">
            <table class="cit-table">
                <thead><tr>
                    <th>Estudiante</th>
                    <th>Curso</th>
                    <th>Motivo</th>
                    <th>Fecha límite</th>
                    <th>Estado</th>
                </tr></thead>
                <tbody>
                ${slice.map(c => {
                    const asist = c.asistencia || 'PENDIENTE';
                    const st    = STATUS_CFG[asist] || { cls: '', txt: asist };
                    return `<tr data-id="${c.id}" style="${asist === 'ANULADA' ? 'opacity:.42;' : ''}">
                        <td><div class="cit-table__main">${_escapeHtml(c.estudiante_nombre)}</div></td>
                        <td>${_escapeHtml(c.curso || '—')}</td>
                        <td>${_escapeHtml(MOTIVOS[c.motivo] || c.motivo || '—')}</td>
                        <td>${fmtFecha(c.fecha_limite_asistencia)}</td>
                        <td><span class="cit-badge-status cit-badge-status--${st.cls}">
                            <span class="cit-status-dot"></span>${_escapeHtml(st.txt)}
                        </span></td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        </div>`;

    container.querySelectorAll('tbody tr[data-id]').forEach(row => {
        row.addEventListener('click', () => _abrirModalDetalleCit(parseInt(row.dataset.id)));
    });

    if (footer) {
        const btnStyle = 'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:.85rem;padding:6px 14px;transition:background .15s,color .15s;';
        const paginHtml = pages > 1 ? `
            <div style="display:flex;align-items:center;gap:8px;">
                <button style="${btnStyle}" onclick="_citPage=Math.max(0,_citPage-1);_aplicarFiltroCit();" ${_citPage===0?'disabled':''}>&#8249;</button>
                <span style="font-size:.82rem;color:var(--text-muted);min-width:60px;text-align:center;">${_citPage+1} / ${pages}</span>
                <button style="${btnStyle}" onclick="_citPage=Math.min(${pages-1},_citPage+1);_aplicarFiltroCit();" ${_citPage>=pages-1?'disabled':''}>&#8250;</button>
            </div>` : '';
        footer.innerHTML = `<span style="color:var(--text-muted);font-size:.8rem;">${total} citacion${total !== 1 ? 'es' : ''}</span>${paginHtml}`;
    }
}

// ── Cargar comunicados ────────────────────────────────────────────
async function cargarComunicados() {
    const spinner   = document.getElementById('comSpinner');
    const container = document.getElementById('comTablaWrap');

    if (spinner)   spinner.style.display = 'flex';
    if (container) container.innerHTML = '';

    const { ok, data } = await fetchAPI('/api/comunicados/');

    if (spinner) spinner.style.display = 'none';

    if (!ok) return;

    _todosComunicados = data || [];
    _aplicarFiltroCom();
}

function _aplicarFiltroCom() {
    const q           = (document.getElementById('searchInputProf')?.value || '').toLowerCase().trim();
    const container   = document.getElementById('comTablaWrap');
    const footer      = document.getElementById('comGridFooter');
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (!container) return;

    let filtrados = _todosComunicados.filter(c => {
        if (!c.fecha_creacion) return false;
        const d = new Date(c.fecha_creacion);
        if (d.getFullYear() !== _comMesObj.year || d.getMonth() !== _comMesObj.month) return false;
        const esAnulado = c.estado === 'ANULADO';
        if (_comFiltroAnulado === 'ANULADO' && !esAnulado) return false;
        if (_comFiltroAnulado === 'ACTIVO'  &&  esAnulado) return false;
        return true;
    });

    if (q) {
        filtrados = filtrados.filter(c =>
            (c.titulo || '').toLowerCase().includes(q)
        );
    }

    if (!filtrados.length) {
        container.innerHTML = `<div class="empty-cards">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <p>No hay comunicados en este período.</p>
        </div>`;
        if (footer) footer.innerHTML = '';
        return;
    }

    const total = filtrados.length;
    const pages = Math.ceil(total / _COM_PER_PAGE);
    if (_comPage >= pages) _comPage = pages - 1;
    const slice = filtrados.slice(_comPage * _COM_PER_PAGE, (_comPage + 1) * _COM_PER_PAGE);

    container.innerHTML = `
        <div class="cit-table-wrap">
            <table class="cit-table">
                <thead><tr>
                    <th>Título</th>
                    <th>Alcance</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                </tr></thead>
                <tbody>
                ${slice.map(c => {
                    const anulado  = c.estado === 'ANULADO';
                    const fechaStr = c.fecha_creacion
                        ? new Date(c.fecha_creacion).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—';
                    return `<tr data-id="${c.id}" style="${anulado ? 'opacity:.42;' : ''}">
                        <td>
                            <div class="cit-table__main">${_escapeHtml(c.titulo)}</div>
                            <div class="cit-table__muted">${_escapeHtml((c.descripcion || '').slice(0, 80))}${(c.descripcion || '').length > 80 ? '...' : ''}</div>
                        </td>
                        <td>${_escapeHtml(c.alcance_display || c.alcance || '—')}</td>
                        <td>${_escapeHtml(fechaStr)}</td>
                        <td>${anulado
                            ? '<span style="display:inline-block;font-size:.67rem;font-weight:700;padding:1px 7px;border-radius:99px;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25);">Anulado</span>'
                            : '<span style="display:inline-block;font-size:.67rem;font-weight:700;padding:1px 7px;border-radius:99px;background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25);">Activo</span>'
                        }</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        </div>`;

    container.querySelectorAll('tbody tr[data-id]').forEach(row => {
        row.addEventListener('click', () => {
            const id  = parseInt(row.dataset.id);
            const com = _todosComunicados.find(c => c.id === id);
            if (com) _abrirModalDetalleCom(com, currentUser);
        });
    });

    if (footer) {
        const btnStyle = 'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-size:.85rem;padding:6px 14px;transition:background .15s,color .15s;';
        const paginHtml = pages > 1 ? `
            <div style="display:flex;align-items:center;gap:8px;">
                <button style="${btnStyle}" onclick="_comPage=Math.max(0,_comPage-1);_aplicarFiltroCom();" ${_comPage===0?'disabled':''}>&#8249;</button>
                <span style="font-size:.82rem;color:var(--text-muted);min-width:60px;text-align:center;">${_comPage+1} / ${pages}</span>
                <button style="${btnStyle}" onclick="_comPage=Math.min(${pages-1},_comPage+1);_aplicarFiltroCom();" ${_comPage>=pages-1?'disabled':''}>&#8250;</button>
            </div>` : '';
        footer.innerHTML = `<span style="color:var(--text-muted);font-size:.8rem;">${total} comunicado${total !== 1 ? 's' : ''}</span>${paginHtml}`;
    }
}


// ── Modal: Detalle citación ───────────────────────────────────────
function _initDetalleCitModals() {
    document.getElementById('btnCerrarDetalleCitProf').addEventListener('click', _cerrarModalDetalleCit);
    document.getElementById('btnCerrarDetalleCitBtn').addEventListener('click', _cerrarModalDetalleCit);
    document.getElementById('modalDetalleCitProf').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalDetalleCit();
    });
    document.getElementById('btnCerrarMarcarCitProf').addEventListener('click', _cerrarModalMarcarCit);
    document.getElementById('btnCancelarMarcarCitProf').addEventListener('click', _cerrarModalMarcarCit);
    document.getElementById('btnConfirmarMarcarCitProf').addEventListener('click', _confirmarMarcarCit);
    document.getElementById('modalMarcarCitProf').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalMarcarCit();
    });

    // Anular citación
    document.getElementById('btnCancelarAnularCit')?.addEventListener('click', _cerrarModalAnularCit);
    document.getElementById('btnConfirmarAnularCit')?.addEventListener('click', _confirmarAnularCit);
    document.getElementById('modalAnularCitProf')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalAnularCit();
    });

    // Anular comunicado
    document.getElementById('btnCancelarAnularCom')?.addEventListener('click', _cerrarModalAnularCom);
    document.getElementById('btnConfirmarAnularCom')?.addEventListener('click', _confirmarAnularCom);
    document.getElementById('modalAnularComProf')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalAnularCom();
    });

    // Detalle comunicado
    document.getElementById('btnCerrarDetalleComProf')?.addEventListener('click', _cerrarModalDetalleCom);
    document.getElementById('btnCerrarDetalleComBtn')?.addEventListener('click', _cerrarModalDetalleCom);
    document.getElementById('modalDetalleComProf')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalDetalleCom();
    });
    document.getElementById('btnAnularComDesdeDetalle')?.addEventListener('click', () => {
        if (!_detalleComData) return;
        _cerrarModalDetalleCom();
        _abrirModalAnularCom(_detalleComData.id, _detalleComData.titulo);
    });
    document.getElementById('btnVerDestinatariosComProf')?.addEventListener('click', _toggleDestinatariosComProf);
    document.getElementById('btnCerrarDestinatariosComProf')?.addEventListener('click', _colapsarDestinatariosComProf);
    document.getElementById('comDestBuscar')?.addEventListener('input', _filtrarDestinatariosComProf);
}

// ── Modal: Detalle comunicado ─────────────────────────────────────
let _detalleComData = null;

const _ALCANCE_DESC = {
    TODOS:     'Todos los padres registrados',
    GRADO:     'Padres del grado',
    CURSO:     'Padres del curso',
    MIS_CURSOS:'Padres de mis cursos asignados',
    GRUPO:     'Grupo de cursos seleccionados',
};

function _abrirModalDetalleCom(c, currentUser) {
    _detalleComData = c;
    const modal = document.getElementById('modalDetalleComProf');
    if (!modal) return;

    const anulado     = c.estado === 'ANULADO';
    const esDirector  = currentUser?.tipo_usuario === 'Director';
    const puedeAnular = !anulado && currentUser && currentUser.id === c.emisor_id;
    const fecha = c.fecha_envio
        ? new Date(c.fecha_envio).toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    let alcanceTexto = _ALCANCE_DESC[c.alcance] || c.alcance_display || c.alcance;
    if (c.alcance === 'CURSO' && c.curso_nombre) alcanceTexto = `Padres del curso ${c.curso_nombre}`;
    if (c.alcance === 'GRADO' && c.grado)        alcanceTexto = `Padres del grado ${c.grado}`;

    document.getElementById('detalleComTitulo').textContent    = c.titulo || '—';
    document.getElementById('detalleComContenido').textContent = c.descripcion || '—';
    document.getElementById('detalleComAlcance').textContent   = alcanceTexto;
    document.getElementById('detalleComFecha').textContent     = fecha;

    const emisorWrap = document.getElementById('detalleComEmisorWrap');
    if (emisorWrap) {
        emisorWrap.style.display = esDirector && c.emisor_nombre ? 'block' : 'none';
        const emisorEl = document.getElementById('detalleComEmisor');
        if (emisorEl) emisorEl.textContent = `${c.emisor_nombre || '—'} (${c.emisor_tipo || '—'})`;
    }

    const badgeEl = document.getElementById('detalleComBadge');
    if (badgeEl) {
        badgeEl.innerHTML = anulado
            ? `<span class="estado-badge estado-badge--anulada">Anulado</span>`
            : `<span class="estado-badge" style="background:rgba(34,197,94,.15);color:#22c55e;">Activo</span>`;
    }

    const btnAnular = document.getElementById('btnAnularComDesdeDetalle');
    if (btnAnular) btnAnular.style.display = puedeAnular ? 'inline-flex' : 'none';

    // Colapsar panel derecho al abrir
    _colapsarDestinatariosComProf();

    modal.classList.add('visible');
}

function _cerrarModalDetalleCom() {
    _colapsarDestinatariosComProf();
    document.getElementById('modalDetalleComProf')?.classList.remove('visible');
    _detalleComData = null;
}

// ── Panel derecho: destinatarios del comunicado ───────────────────
let _destinatariosCache = null;

function _colapsarDestinatariosComProf() {
    document.getElementById('modalComWrap')?.classList.remove('modal-com-wrap--expanded');
    _destinatariosCache = null;
}

async function _toggleDestinatariosComProf() {
    const wrap = document.getElementById('modalComWrap');
    if (!wrap) return;
    if (wrap.classList.contains('modal-com-wrap--expanded')) {
        _colapsarDestinatariosComProf();
        return;
    }
    wrap.classList.add('modal-com-wrap--expanded');
    if (_detalleComData) await _cargarDestinatariosComProf(_detalleComData.id);
}

async function _cargarDestinatariosComProf(comId) {
    const listEl    = document.getElementById('comDestList');
    const subEl     = document.getElementById('comDestSubtitulo');
    const footerEl  = document.getElementById('comDestFooter');
    const buscarEl  = document.getElementById('comDestBuscar');
    if (!listEl) return;

    listEl.innerHTML = '<p style="padding:12px;font-size:.83rem;color:var(--text-muted);">Cargando…</p>';
    if (buscarEl) buscarEl.value = '';

    const { ok, data } = await fetchAPI(`/api/comunicados/${comId}/cobertura/`);
    if (!ok) {
        listEl.innerHTML = `<p style="padding:12px;font-size:.83rem;color:var(--danger);">${data?.errores || 'Error al cargar.'}</p>`;
        return;
    }

    _destinatariosCache = data.tutores || [];
    if (subEl) subEl.textContent = `${data.total} padre${data.total !== 1 ? 's' : ''} destinatarios`;
    if (footerEl) footerEl.textContent = `Con notificación: ${data.con_fcm} | Sin notificación: ${data.sin_fcm}`;

    _renderDestinatariosComProf(_destinatariosCache);
}

function _renderDestinatariosComProf(tutores) {
    const listEl = document.getElementById('comDestList');
    if (!listEl) return;
    if (!tutores.length) {
        listEl.innerHTML = '<p class="cobertura-empty">Sin destinatarios.</p>';
        return;
    }

    const grupos = {};
    tutores.forEach(t => {
        const hijos = t.estudiantes || [];
        const cursosDelPadre = hijos.length ? [...new Set(hijos.map(e => e.curso))] : ['Sin curso'];
        cursosDelPadre.forEach(curso => {
            if (!grupos[curso]) grupos[curso] = [];
            if (!grupos[curso].find(x => x.id === t.id)) grupos[curso].push(t);
        });
    });

    listEl.innerHTML = Object.keys(grupos).sort().map(curso => {
        const items    = grupos[curso];
        const conFcm   = items.filter(t => t.tiene_fcm).length;
        const total    = items.length;
        const badgeCls = conFcm === 0 ? 'none' : conFcm < total ? 'warn' : 'ok';

        const itemsHtml = items.map(t => {
            const hijosHtml = (t.estudiantes || [])
                .filter(e => e.curso === curso || curso === 'Sin curso')
                .map(e => `<span class="cobertura-item__hijo">${_escapeHtml(e.nombre)} <span class="cobertura-item__curso">${_escapeHtml(e.curso)}</span></span>`)
                .join('');
            return `<div class="cobertura-item">
                <span class="cobertura-item__dot cobertura-item__dot--${t.tiene_fcm ? 'si' : 'no'}"></span>
                <span class="cobertura-item__info">
                    <span class="cobertura-item__nombre">${_escapeHtml(t.nombre)}</span>
                    ${hijosHtml ? `<span class="cobertura-item__hijos">${hijosHtml}</span>` : ''}
                </span>
                <span class="cobertura-item__badge cobertura-item__badge--${t.tiene_fcm ? 'si' : 'no'}">${t.tiene_fcm ? 'Activo' : 'Sin app'}</span>
            </div>`;
        }).join('');

        return `<div class="cobertura-grupo cobertura-grupo--collapsed">
            <div class="cobertura-grupo__header">
                <svg class="cobertura-grupo__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                <span class="cobertura-grupo__nombre">${_escapeHtml(curso)}</span>
                <span class="cobertura-grupo__badge cobertura-grupo__badge--${badgeCls}">${conFcm}/${total} activos</span>
            </div>
            <div class="cobertura-grupo__items">${itemsHtml}</div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.cobertura-grupo__header').forEach(hdr => {
        hdr.addEventListener('click', () => hdr.closest('.cobertura-grupo').classList.toggle('cobertura-grupo--collapsed'));
    });
}

function _filtrarDestinatariosComProf() {
    if (!_destinatariosCache) return;
    const q = (document.getElementById('comDestBuscar')?.value || '').toLowerCase().trim();
    if (!q) { _renderDestinatariosComProf(_destinatariosCache); return; }
    const filtrados = _destinatariosCache.filter(t =>
        t.nombre.toLowerCase().includes(q) ||
        (t.estudiantes || []).some(e => e.nombre.toLowerCase().includes(q))
    );
    _renderDestinatariosComProf(filtrados);
}

async function _abrirModalDetalleCit(id) {
    const modal   = document.getElementById('modalDetalleCitProf');
    const spinner = document.getElementById('detalleCitSpinner');
    const body    = document.getElementById('detalleCitBody');

    body.style.display   = 'none';
    spinner.style.display = 'flex';
    modal.classList.add('visible');

    const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${id}/`);
    spinner.style.display = 'none';

    if (!ok) {
        modal.classList.remove('visible');
        showAppToast('error', 'Error', data?.errores || 'No se pudo cargar el detalle.');
        return;
    }

    // Rellenar contenido
    const asist     = data.asistencia || 'PENDIENTE';
    const heroEl    = document.getElementById('detalleCitHero');
    const HERO_CLS  = { PENDIENTE: 'modal-det__hero--PENDIENTE', ASISTIO: 'modal-det__hero--ASISTIO', NO_ASISTIO: 'modal-det__hero--NO_ASISTIO', ATRASO: 'modal-det__hero--ATRASO', ANULADA: 'modal-det__hero--ANULADA' };
    heroEl.className = `modal-det__hero ${HERO_CLS[asist] || ''}`;

    document.getElementById('detalleCitNombre').textContent = data.estudiante_nombre || '—';
    document.getElementById('detalleCitCurso').textContent  = data.curso || '—';

    const BADGE_CLS = { PENDIENTE: 'estado-badge--pendiente', ASISTIO: 'estado-badge--asistio', NO_ASISTIO: 'estado-badge--no_asistio', ATRASO: 'estado-badge--atraso', ANULADA: 'estado-badge--anulada' };
    document.getElementById('detalleCitBadge').innerHTML =
        `<span class="estado-badge ${BADGE_CLS[asist] || ''}">${_escapeHtml(ASISTENCIA_LABELS[asist] || asist)}</span>`;

    document.getElementById('detalleCitMotivo').textContent  = MOTIVOS[data.motivo] || data.motivo || '—';
    document.getElementById('detalleCitTutor').textContent   = data.tutor_nombre || 'Sin tutor';
    document.getElementById('detalleCitEmisor').textContent  = `${data.emitido_por_nombre || '—'} (${data.emitido_por_cargo || '—'})`;

    const fmtFecha = s => s ? new Date(s).toLocaleDateString('es-BO') : '—';
    const fmtDate  = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-BO') : '—';
    document.getElementById('detalleCitFechaEnvio').textContent = fmtFecha(data.fecha_envio);
    document.getElementById('detalleCitFechaLim').textContent   = fmtDate(data.fecha_limite_asistencia);
    document.getElementById('detalleCitFechaAsist').textContent = fmtDate(data.fecha_asistencia);

    const descWrap = document.getElementById('detalleCitDescWrap');
    if (data.motivo_descripcion) {
        document.getElementById('detalleCitDesc').textContent = data.motivo_descripcion;
        descWrap.style.display = 'block';
    } else {
        descWrap.style.display = 'none';
    }

    const currentUser = JSON.parse(localStorage.getItem('user') || 'null');

    // Botón marcar asistencia: solo si el usuario actual es el emisor y no está resuelta/anulada
    const puedeMarcar = currentUser && data.emisor_id === currentUser.id && !['ASISTIO', 'ATRASO', 'ANULADA'].includes(asist);
    const btnMarcar   = document.getElementById('btnIrAMarcarCit');
    btnMarcar.style.display = puedeMarcar ? 'inline-flex' : 'none';
    if (puedeMarcar) {
        btnMarcar.onclick = () => {
            _cerrarModalDetalleCit();
            _abrirModalMarcarCit(data.id, data.estudiante_nombre);
        };
    }

    // Botón anular: solo si no está resuelta ni anulada, y el usuario es el emisor
    const puedeAnular = currentUser && data.emisor_id === currentUser.id && !['ASISTIO', 'ATRASO', 'ANULADA'].includes(asist);
    const btnAnular   = document.getElementById('btnAnularCit');
    btnAnular.style.display = puedeAnular ? 'inline-flex' : 'none';
    if (puedeAnular) {
        btnAnular.onclick = () => {
            _cerrarModalDetalleCit();
            _abrirModalAnularCit(data.id, data.estudiante_nombre);
        };
    }

    body.style.display = 'block';
}

function _cerrarModalDetalleCit() {
    document.getElementById('modalDetalleCitProf').classList.remove('visible');
}

function _abrirModalMarcarCit(id, nombre) {
    _marcarCitId = id;
    document.getElementById('marcarCitNombre').textContent  = nombre || '—';
    document.getElementById('marcarCitError').style.display = 'none';
    document.getElementById('modalMarcarCitProf').classList.add('visible');
}

function _cerrarModalMarcarCit() {
    document.getElementById('modalMarcarCitProf').classList.remove('visible');
    _marcarCitId = null;
}

async function _confirmarMarcarCit() {
    if (!_marcarCitId) return;
    const btn = document.getElementById('btnConfirmarMarcarCitProf');
    const err = document.getElementById('marcarCitError');

    const btnHtml = btn.innerHTML;
    btn.disabled    = true;
    btn.textContent = 'Confirmando…';
    err.style.display = 'none';

    const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${_marcarCitId}/`, { method: 'PATCH' });

    btn.disabled  = false;
    btn.innerHTML = btnHtml;

    if (!ok) {
        err.textContent   = data?.errores || 'Error al registrar asistencia.';
        err.style.display = 'block';
        return;
    }

    _cerrarModalMarcarCit();
    showAppToast('success', 'Asistencia registrada', `Estado: ${ASISTENCIA_LABELS[data.asistencia] || data.asistencia}.`);
    cargarCitaciones();  // Refrescar lista
}

// ── Anular citación ───────────────────────────────────────────────
function _abrirModalAnularCit(id, nombre) {
    _anularCitId = id;
    document.getElementById('anularCitNombre').textContent  = nombre || '—';
    document.getElementById('anularCitError').style.display = 'none';
    document.getElementById('modalAnularCitProf').classList.add('visible');
}

function _cerrarModalAnularCit() {
    document.getElementById('modalAnularCitProf').classList.remove('visible');
    _anularCitId = null;
}

async function _confirmarAnularCit() {
    if (!_anularCitId) return;
    const btn = document.getElementById('btnConfirmarAnularCit');
    const err = document.getElementById('anularCitError');

    const btnHtml = btn.innerHTML;
    btn.disabled    = true;
    btn.textContent = 'Anulando…';
    err.style.display = 'none';

    const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${_anularCitId}/anular/`, { method: 'PATCH' });

    btn.disabled  = false;
    btn.innerHTML = btnHtml;

    if (!ok) {
        err.textContent   = data?.errores || 'Error al anular la citación.';
        err.style.display = 'block';
        return;
    }

    _cerrarModalAnularCit();
    showAppToast('success', 'Citación anulada', 'La citación fue anulada correctamente.');
    cargarCitaciones();
}

// ── Anular comunicado ─────────────────────────────────────────────
function _abrirModalAnularCom(id, titulo) {
    _anularComId = id;
    document.getElementById('anularComTitulo').textContent  = titulo || '—';
    document.getElementById('anularComError').style.display = 'none';
    document.getElementById('modalAnularComProf').classList.add('visible');
}

function _cerrarModalAnularCom() {
    document.getElementById('modalAnularComProf').classList.remove('visible');
    _anularComId = null;
}

async function _confirmarAnularCom() {
    if (!_anularComId) return;
    const btn = document.getElementById('btnConfirmarAnularCom');
    const err = document.getElementById('anularComError');

    const btnHtml = btn.innerHTML;
    btn.disabled    = true;
    btn.textContent = 'Anulando…';
    err.style.display = 'none';

    const { ok, data } = await fetchAPI(`/api/comunicados/${_anularComId}/anular/`, { method: 'PATCH' });

    btn.disabled  = false;
    btn.innerHTML = btnHtml;

    if (!ok) {
        err.textContent   = data?.errores || 'Error al anular el comunicado.';
        err.style.display = 'block';
        return;
    }

    _cerrarModalAnularCom();
    showAppToast('success', 'Comunicado anulado', 'El comunicado fue anulado correctamente.');
    cargarComunicados();
}

// ── Selector de cursos en grupo (pills) ──────────────────────────
let _grupoSeleccionados = [];  // [{ id, label }]

function _renderGrupoPills() {
    const pillsEl  = document.getElementById('comProfGrupoPills');
    const grupoSel = document.getElementById('comProfGrupoSelect');
    if (!pillsEl || !grupoSel) return;

    // Reconstruir opciones del select (solo los no seleccionados)
    const selIds = new Set(_grupoSeleccionados.map(c => c.id));
    grupoSel.innerHTML = '<option value="">— Añadir curso —</option>';
    _cursos.forEach(c => {
        if (!selIds.has(c.id)) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.grado} "${c.paralelo}"`;
            grupoSel.appendChild(opt);
        }
    });

    // Renderizar pastillas
    pillsEl.innerHTML = _grupoSeleccionados.map(c => `
        <span class="curso-pill" data-id="${c.id}">
            ${_escapeHtml(c.label)}
            <button type="button" class="curso-pill__remove" aria-label="Quitar">&#x2715;</button>
        </span>
    `).join('');

    pillsEl.querySelectorAll('.curso-pill__remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.closest('.curso-pill').dataset.id);
            _grupoSeleccionados = _grupoSeleccionados.filter(c => c.id !== id);
            _renderGrupoPills();
            _actualizarCoberturaFCMProf();
        });
    });

    _actualizarCoberturaFCMProf();
}

// ── Cobertura FCM — Profesor ─────────────────────────────────────
let _coberturaTimerProf = null;
let _coberturaCacheProf = null;

async function _actualizarCoberturaFCMProf() {
    const wrap  = document.getElementById('fcmCoberturaWrapProf');
    const texto = document.getElementById('fcmCoberturaTextoProf');
    const btn   = document.getElementById('fcmCoberturaBtnProf');
    if (!wrap || !texto || !btn) return;

    const alcance = document.getElementById('comProfAlcance')?.value;
    const cursoId = document.getElementById('comProfCurso')?.value;

    if (alcance === 'CURSO' && !cursoId) { wrap.style.display = 'none'; return; }
    if (alcance === 'GRUPO' && _grupoSeleccionados.length === 0) { wrap.style.display = 'none'; return; }

    clearTimeout(_coberturaTimerProf);
    _coberturaTimerProf = setTimeout(async () => {
        wrap.style.display = 'block';
        texto.textContent  = 'Calculando…';
        btn.className      = 'fcm-cobertura-pill';

        const params = new URLSearchParams({ alcance });
        if (alcance === 'CURSO') params.set('curso_id', cursoId);
        if (alcance === 'GRUPO') params.set('curso_ids', _grupoSeleccionados.map(c => c.id).join(','));

        const { ok, data } = await fetchAPI(`/api/notifications/cobertura-comunicado/?${params}`);
        if (!ok) { wrap.style.display = 'none'; return; }

        _coberturaCacheProf = { data, alcance };

        const { total, con_fcm } = data;
        if (total === 0) {
            texto.textContent = 'Sin padres registrados en este alcance';
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--none';
        } else if (con_fcm === 0) {
            texto.textContent = `Ningún padre recibirá la notificación (0 de ${total})`;
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--none';
        } else if (con_fcm < total) {
            texto.textContent = `${con_fcm} de ${total} padres recibirán la notificación — ver detalle`;
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--warn';
        } else {
            texto.textContent = `Los ${total} padres recibirán la notificación — ver detalle`;
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--ok';
        }
    }, 250);
}

function _renderPanelCoberturaProf(query) {
    const list = document.getElementById('panelCoberturaListProf');
    if (!list || !_coberturaCacheProf) return;

    const { tutores } = _coberturaCacheProf.data;
    const q = (query || '').toLowerCase().trim();

    const filtrados = q
        ? tutores.filter(t =>
            t.nombre.toLowerCase().includes(q) ||
            (t.estudiantes || []).some(e =>
                e.nombre.toLowerCase().includes(q) || e.curso.toLowerCase().includes(q)
            )
          )
        : tutores;

    if (!filtrados.length) {
        list.innerHTML = `<p class="cobertura-empty">Sin resultados para "${_escapeHtml(q)}".</p>`;
        return;
    }

    const grupos = {};
    filtrados.forEach(t => {
        const hijos = t.estudiantes || [];
        const cursosDelPadre = hijos.length
            ? [...new Set(hijos.map(e => e.curso))]
            : ['Sin curso'];
        cursosDelPadre.forEach(curso => {
            if (!grupos[curso]) grupos[curso] = [];
            if (!grupos[curso].find(x => x.id === t.id)) grupos[curso].push(t);
        });
    });

    list.innerHTML = Object.keys(grupos).sort().map(curso => {
        const items    = grupos[curso];
        const conFcm   = items.filter(t => t.tiene_fcm).length;
        const total    = items.length;
        const badgeCls = conFcm === 0 ? 'none' : conFcm < total ? 'warn' : 'ok';

        const itemsHtml = items.map(t => {
            const hijosHtml = (t.estudiantes || [])
                .filter(e => e.curso === curso || curso === 'Sin curso')
                .map(e => `<span class="cobertura-item__hijo">${_escapeHtml(e.nombre)} <span class="cobertura-item__curso">${_escapeHtml(e.curso)}</span></span>`)
                .join('');
            return `
            <div class="cobertura-item">
                <span class="cobertura-item__dot cobertura-item__dot--${t.tiene_fcm ? 'si' : 'no'}"></span>
                <span class="cobertura-item__info">
                    <span class="cobertura-item__nombre">${_escapeHtml(t.nombre)}</span>
                    ${hijosHtml ? `<span class="cobertura-item__hijos">${hijosHtml}</span>` : ''}
                </span>
                <span class="cobertura-item__badge cobertura-item__badge--${t.tiene_fcm ? 'si' : 'no'}">
                    ${t.tiene_fcm ? 'Activo' : 'Sin app'}
                </span>
            </div>`;
        }).join('');

        return `
        <div class="cobertura-grupo cobertura-grupo--collapsed">
            <div class="cobertura-grupo__header">
                <svg class="cobertura-grupo__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                <span class="cobertura-grupo__nombre">${_escapeHtml(curso)}</span>
                <span class="cobertura-grupo__badge cobertura-grupo__badge--${badgeCls}">${conFcm}/${total} activos</span>
            </div>
            <div class="cobertura-grupo__items">${itemsHtml}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.cobertura-grupo__header').forEach(hdr => {
        hdr.addEventListener('click', () => hdr.closest('.cobertura-grupo').classList.toggle('cobertura-grupo--collapsed'));
    });
}

function _abrirPanelCoberturaProf() {
    if (!_coberturaCacheProf) return;
    const panel    = document.getElementById('panelCoberturaProf');
    const backdrop = document.getElementById('backdropCoberturaProf');
    const subtitle = document.getElementById('panelCoberturaSubtitleProf');
    const footer   = document.getElementById('panelCoberturaFooterProf');
    const buscar   = document.getElementById('coberturaBuscarProf');
    if (!panel) return;

    const { data, alcance } = _coberturaCacheProf;
    const labels = { MIS_CURSOS: 'Mis cursos', CURSO: 'Curso seleccionado', GRUPO: 'Grupo de cursos' };
    subtitle.textContent = labels[alcance] || alcance;
    footer.textContent   = `${data.con_fcm} con notificación activa · ${data.sin_fcm} sin app · ${data.total} en total`;

    if (buscar) buscar.value = '';
    _renderPanelCoberturaProf('');

    panel.style.display    = 'flex';
    backdrop.style.display = 'block';
    if (buscar) buscar.focus();
}

function _cerrarPanelCoberturaProf() {
    document.getElementById('panelCoberturaProf').style.display    = 'none';
    document.getElementById('backdropCoberturaProf').style.display = 'none';
}

// ── Modal: Nuevo Comunicado (Profesor) ───────────────────────────
function _initComunicadoForm() {
    const modal = document.getElementById('modalNuevoComunicadoProf');
    if (!modal) return;

    document.getElementById('comProfAlcance').addEventListener('change', function () {
        document.getElementById('comProfCursoWrap').style.display = this.value === 'CURSO' ? 'block' : 'none';
        document.getElementById('comProfGrupoWrap').style.display = this.value === 'GRUPO' ? 'block' : 'none';
        _actualizarCoberturaFCMProf();
    });

    document.getElementById('comProfCurso').addEventListener('change', _actualizarCoberturaFCMProf);

    document.getElementById('comProfGrupoSelect').addEventListener('change', function () {
        if (!this.value) return;
        const id    = parseInt(this.value);
        const label = this.options[this.selectedIndex].textContent;
        _grupoSeleccionados.push({ id, label });
        _renderGrupoPills();
        this.value = '';
    });

    document.getElementById('fcmCoberturaBtnProf').addEventListener('click', _abrirPanelCoberturaProf);
    document.getElementById('btnCerrarPanelCoberturaProf').addEventListener('click', _cerrarPanelCoberturaProf);
    document.getElementById('backdropCoberturaProf').addEventListener('click', _cerrarPanelCoberturaProf);
    document.getElementById('coberturaBuscarProf').addEventListener('input', e => _renderPanelCoberturaProf(e.target.value));

    document.getElementById('btnCerrarModalComProf').addEventListener('click', _cerrarModalNuevoComunicadoProf);
    document.getElementById('btnCancelarComProf').addEventListener('click', _cerrarModalNuevoComunicadoProf);
    modal.addEventListener('click', e => { if (e.target === e.currentTarget) _cerrarModalNuevoComunicadoProf(); });

    document.getElementById('formComunicadoProf').addEventListener('submit', async e => {
        e.preventDefault();
        await _enviarComunicadoProf();
    });
}

function _abrirModalNuevoComunicadoProf() {
    const sel = document.getElementById('comProfCurso');
    sel.innerHTML = '<option value="">— Selecciona un curso —</option>';
    _cursos.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.grado} "${c.paralelo}"`;
        sel.appendChild(opt);
    });
    _grupoSeleccionados = [];
    _coberturaCacheProf = null;
    _renderGrupoPills();
    document.getElementById('formComunicadoProf').reset();
    document.getElementById('comProfCursoWrap').style.display    = 'none';
    document.getElementById('comProfGrupoWrap').style.display    = 'none';
    document.getElementById('comProfError').style.display        = 'none';
    document.getElementById('fcmCoberturaWrapProf').style.display = 'none';
    document.getElementById('modalNuevoComunicadoProf').classList.add('visible');
    // Alcance por defecto es MIS_CURSOS → disparar cobertura inmediatamente
    _actualizarCoberturaFCMProf();
}

function _cerrarModalNuevoComunicadoProf() {
    document.getElementById('modalNuevoComunicadoProf').classList.remove('visible');
}

async function _enviarComunicadoProf() {
    const titulo    = document.getElementById('comProfTitulo').value.trim();
    const contenido = document.getElementById('comProfContenido').value.trim();
    const alcance   = document.getElementById('comProfAlcance').value;
    const cursoId   = document.getElementById('comProfCurso').value;
    const btn       = document.getElementById('btnEnviarComProf');
    const errEl     = document.getElementById('comProfError');

    errEl.style.display = 'none';
    if (!titulo || !contenido) {
        errEl.textContent = 'Completa todos los campos obligatorios.';
        errEl.style.display = 'block';
        return;
    }
    if (alcance === 'CURSO' && !cursoId) {
        errEl.textContent = 'Selecciona un curso específico.';
        errEl.style.display = 'block';
        return;
    }

    const cursosGrupo = alcance === 'GRUPO' ? _grupoSeleccionados.map(c => c.id) : [];
    if (alcance === 'GRUPO' && cursosGrupo.length < 2) {
        errEl.textContent = 'Selecciona al menos 2 cursos.';
        errEl.style.display = 'block';
        return;
    }

    const payload = { titulo, descripcion: contenido, alcance };
    if (alcance === 'CURSO') payload.curso = parseInt(cursoId);
    if (alcance === 'GRUPO') payload.cursos_grupo_ids = cursosGrupo;

    const btnHtml = btn.innerHTML;
    btn.disabled    = true;
    btn.textContent = 'Enviando…';

    const { ok, data } = await fetchAPI('/api/comunicados/crear/', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    btn.disabled  = false;
    btn.innerHTML = btnHtml;

    if (!ok) {
        errEl.textContent   = data?.errores || data?.titulo?.[0] || data?.descripcion?.[0] || 'Error al enviar el comunicado.';
        errEl.style.display = 'block';
        return;
    }

    showAppToast('success', 'Comunicado enviado', 'El anuncio fue registrado y enviado correctamente.');
    _cerrarModalNuevoComunicadoProf();
    cargarComunicados();
}

// ── Checklist de contraseña en tiempo real ────────────────────────
function _actualizarChecks(password, prefix) {
    const wrap = document.getElementById(`${prefix}PassChecks`);
    if (!wrap) return;
    wrap.classList.toggle('visible', password.length > 0);

    const reglas = [
        { id: `${prefix}Check8`,     fn: v => v.length >= 8 && v.length <= 64 },
        { id: `${prefix}CheckUpper`, fn: v => /[A-Z]/.test(v) },
        { id: `${prefix}CheckLower`, fn: v => /[a-z]/.test(v) },
        { id: `${prefix}CheckNum`,   fn: v => /[0-9]/.test(v) },
        { id: `${prefix}CheckSpec`,  fn: v => /[^a-zA-Z0-9\s]/.test(v) },
        { id: `${prefix}CheckSpace`, fn: v => v.length > 0 && !v.includes(' ') },
    ];
    reglas.forEach(({ id, fn }) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('ok', fn(password));
    });
}

// ── Toggle mostrar/ocultar contraseña ─────────────────────────────
document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-toggle-pass');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.querySelector('.icon-eye').style.display     = showing ? '' : 'none';
    btn.querySelector('.icon-eye-off').style.display = showing ? 'none' : '';
});

// ── Primer ingreso — modal forzado ────────────────────────────────
function _initPrimerIngreso() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || !user.primer_ingreso) return;

    const overlay = document.getElementById('primerIngresoOverlay');
    overlay.classList.add('visible');

    document.getElementById('piPassNueva').addEventListener('input', e => {
        _actualizarChecks(e.target.value, 'pi');
    });

    document.getElementById('formPrimerIngreso').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl   = document.getElementById('piError');
        const btn     = document.getElementById('btnPrimerIngreso');
        const uNuevo  = document.getElementById('piUsernameNuevo').value.trim();
        const pActual = document.getElementById('piPassActual').value;
        const pNueva  = document.getElementById('piPassNueva').value;

        errEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Guardando…';

        const { ok, data } = await fetchAPI('/api/auth/cambiar-credenciales/', {
            method: 'POST',
            body: JSON.stringify({
                password_actual: pActual,
                username_nuevo:  uNuevo,
                password_nueva:  pNueva,
            }),
        });

        if (!ok) {
            const msg = data?.errores || data?.username_nuevo?.[0] || data?.password_nueva?.[0]
                || 'Error al guardar. Intenta de nuevo.';
            errEl.textContent   = msg;
            errEl.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Guardar y continuar';
            return;
        }

        // Actualizar localStorage con los nuevos datos
        localStorage.setItem('user', JSON.stringify(data.user));
        overlay.classList.remove('visible');

        // Actualizar nombre en sidebar
        const nombre = `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.username;
        document.getElementById('profileName').textContent = "Republica de Francia 'A'";
    });
}

// ── Tab Cuenta — perfil + modal credenciales ──────────────────────
let _cuentaIniciada = false;

function _initCuentaTab() {
    _cargarPerfilStats();

    if (_cuentaIniciada) return;
    _cuentaIniciada = true;

    // Botones del hero → abrir modal
    document.querySelectorAll('[data-cred-mode]').forEach(btn => {
        btn.addEventListener('click', () => _abrirModalCred(btn.dataset.credMode));
    });

    // Cerrar modal
    document.getElementById('credModalClose').addEventListener('click', _cerrarModalCred);
    document.getElementById('credModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarModalCred();
    });

    // Checklist en tiempo real
    document.getElementById('credPassNueva').addEventListener('input', e => {
        _actualizarChecks(e.target.value, 'cred');
    });

    // Submit del modal
    document.getElementById('formCred').addEventListener('submit', async e => {
        e.preventDefault();
        await _submitCred();
    });
}

// ── Modal de credenciales ─────────────────────────────────────────
const _CRED_MODOS = {
    password: {
        title:    'Cambiar contraseña',
        sub:      'Necesitarás tu contraseña actual para confirmar.',
        username: false,
        password: true,
    },
    username: {
        title:    'Cambiar usuario',
        sub:      'El cambio de usuario requiere confirmar tu contraseña.',
        username: true,
        password: false,
    },
    both: {
        title:    'Cambiar usuario y contraseña',
        sub:      'Actualiza ambas credenciales en un solo paso.',
        username: true,
        password: true,
    },
};

let _credModoActual = 'password';

function _abrirModalCred(modo) {
    _credModoActual = modo;
    const cfg = _CRED_MODOS[modo];
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    document.getElementById('credModalTitle').textContent = cfg.title;
    document.getElementById('credModalSub').textContent   = cfg.sub;

    // Mostrar/ocultar campos según modo
    document.getElementById('credGroupUsername').style.display    = cfg.username ? '' : 'none';
    document.getElementById('credGroupPassword').style.display    = cfg.password ? '' : 'none';
    document.getElementById('credCurrentUserRow').style.display   = cfg.username ? '' : 'none';

    if (cfg.username && user) {
        document.getElementById('credCurrentUsername').textContent = user.username || '—';
    }

    // Resetear
    document.getElementById('formCred').reset();
    document.getElementById('credError').style.display = 'none';
    document.getElementById('credSuccess').classList.remove('visible');
    _actualizarChecks('', 'cred');

    document.getElementById('credModalOverlay').classList.add('visible');
    setTimeout(() => document.getElementById('credPassActual').focus(), 80);
}

function _cerrarModalCred() {
    document.getElementById('credModalOverlay').classList.remove('visible');
}

async function _submitCred() {
    const cfg    = _CRED_MODOS[_credModoActual];
    const errEl  = document.getElementById('credError');
    const btn    = document.getElementById('btnGuardarCred');
    const pActual = document.getElementById('credPassActual').value;
    const uNuevo  = cfg.username ? document.getElementById('credUsernameNuevo').value.trim() : '';
    const pNueva  = cfg.password ? document.getElementById('credPassNueva').value : '';

    errEl.style.display = 'none';

    // Confirmación de cambio de usuario
    if (cfg.username && uNuevo) {
        document.getElementById('confirmCredUsername').textContent = uNuevo;
        document.getElementById('confirmCredOverlay').classList.add('visible');
        const confirmado = await new Promise(resolve => {
            document.getElementById('confirmCredAceptar').onclick  = () => { document.getElementById('confirmCredOverlay').classList.remove('visible'); resolve(true); };
            document.getElementById('confirmCredCancelar').onclick = () => { document.getElementById('confirmCredOverlay').classList.remove('visible'); resolve(false); };
        });
        if (!confirmado) return;
    }

    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    const body = { password_actual: pActual };
    if (uNuevo) body.username_nuevo = uNuevo;
    if (pNueva) body.password_nueva = pNueva;

    const { ok, data } = await fetchAPI('/api/auth/cambiar-credenciales/', {
        method: 'POST',
        body: JSON.stringify(body),
    });

    btn.disabled    = false;
    btn.textContent = 'Guardar cambios';

    if (!ok) {
        const msg = data?.errores || data?.username_nuevo?.[0] || data?.password_nueva?.[0] || 'Error al guardar.';
        errEl.textContent   = msg;
        errEl.style.display = 'block';
        return;
    }

    localStorage.setItem('user', JSON.stringify(data.user));

    // Actualizar hero + sidebar
    const nombre = `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.username;
    document.getElementById('profileName').textContent    = "Republica de Francia 'A'";
    document.getElementById('perfilNombre').textContent   = nombre;
    document.getElementById('perfilUsername').textContent = `@${data.user.username}`;
    const partes = nombre.split(' ');
    document.getElementById('perfilAvatar').textContent   = partes.length >= 2
        ? (partes[0][0] + partes[1][0]).toUpperCase()
        : nombre.slice(0, 2).toUpperCase();

    const sucEl = document.getElementById('credSuccess');
    sucEl.classList.add('visible');
    setTimeout(() => { sucEl.classList.remove('visible'); _cerrarModalCred(); }, 2200);
}

async function _cargarPerfilStats() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    // Hero — datos inmediatos desde localStorage
    if (user) {
        const nombre = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
        const partes = nombre.split(' ');
        const iniciales = partes.length >= 2
            ? (partes[0][0] + partes[1][0]).toUpperCase()
            : nombre.slice(0, 2).toUpperCase();
        document.getElementById('perfilAvatar').textContent   = iniciales;
        document.getElementById('perfilNombre').textContent   = nombre;
        document.getElementById('perfilUsername').textContent = `@${user.username}`;
    }

    // Asignaciones — reusar cache si ya se cargaron en el tab Plan
    if (!_planAsignaciones.length) {
        const mesActual = new Date().getMonth() + 1;
        const { ok, data } = await fetchAPI(`/api/academics/profesor/mis-asignaciones/?mes=${mesActual}`);
        if (ok) _planAsignaciones = data;
    }

    document.getElementById('statCursos').textContent = _planAsignaciones.length;

    const cursosEl = document.getElementById('perfilCursosList');
    if (_planAsignaciones.length) {
        cursosEl.innerHTML = `<div class="asig-grid">${
            _planAsignaciones.map(a => `
                <div class="asig-card">
                    <div class="asig-card-top">
                        <div class="asig-card-etiqueta">Curso</div>
                        <div class="asig-card-curso">${_escapeHtml(a.curso_nombre)}</div>
                    </div>
                    <div class="asig-card-bottom">
                        <div class="asig-card-materia-label">Materia</div>
                        <div class="asig-card-materia">${_escapeHtml(a.materia_nombre)}</div>
                    </div>
                </div>`).join('')
        }</div>`;
    } else {
        cursosEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;margin:0;">Sin cursos asignados.</p>';
    }

    // Citaciones
    const { ok: okCit, data: citData } = await fetchAPI('/api/discipline/citaciones/');
    if (okCit && citData) {
        const now = new Date();
        const esMesActual = c => {
            const d = new Date(c.fecha_envio);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        };
        document.getElementById('statCitMes').textContent   = citData.filter(esMesActual).length;
        document.getElementById('statCitTotal').textContent = citData.length;
    }
}
