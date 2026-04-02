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
};

const ASISTENCIA_BADGES = {
    PENDIENTE:  'badge--warning',
    ASISTIO:    'badge--success',
    NO_ASISTIO: 'badge--error',
    ATRASO:     'badge--warning',
    VENCIDA:    'badge--neutral',
};

// ── Estado local ──────────────────────────────────────────────────
let _cursos = [];

// ── Inicialización ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _initSidebar();
    _initLogout();
    _initUserInfo();
    _initTabs();
    _initCitacionesVisualOnly();
    _initDragDrop();
    _initNotasFolderTabs();
    _initNotasNavigation();
    _initCitacionForm();
    _initPlanForm();
    _initPrimerIngreso();
    cargarCursos();
    cargarAsignacionesNotas();
    _verificarDotPlan();  // dot de notificación en background
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
    if (panelId === 'panelCitaciones') cargarHistorial();
    if (panelId === 'panelPlan')       cargarPlanes();
    if (panelId === 'panelCuenta')     _initCuentaTab();
}

function _initTabs() {
    document.getElementById('sideNotas').addEventListener('click',      () => _activarTab('panelNotas'));
    document.getElementById('sideCitaciones').addEventListener('click', () => _activarTab('panelCitaciones'));
    document.getElementById('sidePlan').addEventListener('click',       () => _activarTab('panelPlan'));
    document.getElementById('sideCuenta').addEventListener('click',     () => _activarTab('panelCuenta'));
}

// ── Citaciones/Comunicados (solo interfaz visual, sin backend) ──
function _initCitacionesVisualOnly() {
    const secCit = document.getElementById('secTitleCitProf');
    const secCom = document.getElementById('secTitleComProf');
    const search = document.getElementById('searchInputProf');
    const btnCit = document.getElementById('btnToggleCitProf');
    const btnCom = document.getElementById('btnToggleComProf');
    const stats  = document.getElementById('statsRowProf');
    const secCitCard = document.getElementById('sectionCitCardProf');
    const secComCard = document.getElementById('sectionComCardProf');
    if (!secCit || !secCom || !search || !btnCit || !btnCom || !stats || !secCitCard || !secComCard) return;

    const ahora = new Date();
    const limiteAnio = ahora.getFullYear();
    const limiteMes = ahora.getMonth();
    let mesCit = { year: limiteAnio, month: limiteMes };
    let mesCom = { year: limiteAnio, month: limiteMes };

    const fmtMes = ({ year, month }) =>
        new Date(year, month, 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });

    const _setSec = (sec) => {
        const esCit = sec === 'cit';
        secCit.classList.toggle('sec-title--active', esCit);
        secCom.classList.toggle('sec-title--active', !esCit);
        stats.style.display = esCit ? '' : 'none';
        secCitCard.style.display = esCit ? '' : 'none';
        secComCard.style.display = esCit ? 'none' : '';
        btnCit.style.display = esCit ? '' : 'none';
        btnCom.style.display = esCit ? 'none' : '';
        search.placeholder = esCit
            ? 'Buscar por nombre del estudiante...'
            : 'Buscar por titulo del comunicado...';
    };

    const _setupMonthNav = (prevId, nextId, labelId, getter, setter) => {
        const prev = document.getElementById(prevId);
        const next = document.getElementById(nextId);
        const lbl  = document.getElementById(labelId);
        if (!prev || !next || !lbl) return;
        const paint = () => {
            const v = getter();
            lbl.textContent = fmtMes(v);
            prev.disabled = (v.year === limiteAnio && v.month === 0);
            next.disabled = (v.year === limiteAnio && v.month === limiteMes);
        };
        prev.addEventListener('click', () => {
            const v = getter();
            if (v.year === limiteAnio && v.month === 0) return;
            const d = new Date(v.year, v.month - 1, 1);
            setter({ year: d.getFullYear(), month: d.getMonth() });
            paint();
        });
        next.addEventListener('click', () => {
            const v = getter();
            if (v.year === limiteAnio && v.month === limiteMes) return;
            const d = new Date(v.year, v.month + 1, 1);
            setter({ year: d.getFullYear(), month: d.getMonth() });
            paint();
        });
        paint();
    };

    const _setupChipGroup = (id) => {
        const wrap = document.getElementById(id);
        if (!wrap) return;
        wrap.addEventListener('click', (e) => {
            const chip = e.target.closest('.rol-chip');
            if (!chip) return;
            wrap.querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
            chip.classList.add('rol-chip--active');
        });
    };

    stats.addEventListener('click', (e) => {
        const card = e.target.closest('.cit-stat-card');
        if (!card) return;
        stats.querySelectorAll('.cit-stat-card').forEach(c => c.classList.remove('cit-stat-card--active'));
        card.classList.add('cit-stat-card--active');
    });

    secCit.addEventListener('click', () => _setSec('cit'));
    secCom.addEventListener('click', () => _setSec('com'));

    btnCit.addEventListener('click', () => {
        btnCit.classList.add('is-open');
        setTimeout(() => btnCit.classList.remove('is-open'), 180);
        _abrirModalNuevaCitProf();
    });
    btnCom.addEventListener('click', () => {
        btnCom.classList.add('is-open');
        setTimeout(() => btnCom.classList.remove('is-open'), 180);
    });

    _setupChipGroup('rolChipsProf');
    _setupChipGroup('rolChipsComProf');
    _setupMonthNav('btnMesPrevProf', 'btnMesNextProf', 'citMesLabelProf', () => mesCit, v => { mesCit = v; });
    _setupMonthNav('btnComMesPrevProf', 'btnComMesNextProf', 'comMesLabelProf', () => mesCom, v => { mesCom = v; });
    _setSec('cit');
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
    document.getElementById('profileName').textContent = nombre;
    document.getElementById('profileRole').textContent = user.tipo_usuario || 'Profesor';
}

// ── Drag & Drop Excel ─────────────────────────────────────────────
function _initDragDrop() {
    const zone    = document.getElementById('dropZone');
    const input   = document.getElementById('excelInput');
    const nameEl  = document.getElementById('nombreArchivo');
    const btnUp   = document.getElementById('btnSubirNotas');
    let   _archivo = null;

    function setFile(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            showToast('Solo se aceptan archivos .xlsx o .xls', 'warning');
            return;
        }
        _archivo = file;
        nameEl.textContent = file.name;
        nameEl.style.display = 'block';
        btnUp.disabled = false;
        zone.classList.add('drop-zone--has-file');
        _resetCnResult();
    }

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
        if (input.files[0]) setFile(input.files[0]);
    });

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('drop-zone--over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-zone--over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drop-zone--over');
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    btnUp.addEventListener('click', () => _validarPlanilla(_archivo, btnUp));
}

async function _validarPlanilla(archivo, btnUp) {
    const profesorCursoId = document.getElementById('selectAsignacion').value;
    const errorAsig       = document.getElementById('notasAsignacionError');

    errorAsig.style.display = 'none';
    if (!profesorCursoId) { errorAsig.style.display = 'block'; return; }
    if (!archivo) return;

    btnUp.disabled     = true;
    btnUp.textContent  = 'Validando…';
    _resetCnResult();

    const formData = new FormData();
    formData.append('archivo', archivo);
    formData.append('profesor_curso_id', profesorCursoId);

    // fetch nativo: fetchAPI fuerza Content-Type json, rompería el multipart
    const token = localStorage.getItem('access_token');
    let ok, data;
    try {
        const res = await fetch('/api/academics/profesor/validar-planilla/', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });
        data = await res.json();
        ok   = res.ok;
    } catch {
        data = { errores: 'Error de conexión.' };
        ok   = false;
    }

    btnUp.disabled    = false;
    btnUp.textContent = 'Validar Planilla';

    if (!ok) {
        _mostrarResultadoCarga({ es_valido: false, errores: [data?.errores || 'Error al procesar el archivo.'], metadatos: {} });
        return;
    }
    _mostrarResultadoCarga(data);
}

// ── Muestra resultado en el layout de dos columnas ────────────────
function _mostrarResultadoCarga(r) {
    const metaCard   = document.getElementById('cnMetaCard');
    const metaContent = document.getElementById('cnMetaContent');
    const statusBadge = document.getElementById('cnStatusBadge');
    const emptyState = document.getElementById('cnEmptyState');
    const errorState = document.getElementById('cnErrorState');
    const notasData  = document.getElementById('cnNotasData');
    const tableBadge = document.getElementById('cnTableBadge');
    const meta       = r.metadatos || {};

    // ── Badge de estado ──────────────────────────────────────────
    if (r.es_valido) {
        statusBadge.innerHTML = `<span class="cn-status-badge cn-status-badge--ok">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Planilla válida</span>`;
    } else {
        statusBadge.innerHTML = `<span class="cn-status-badge cn-status-badge--err">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            Planilla inválida</span>`;
    }

    // ── Meta rows ────────────────────────────────────────────────
    const metaRows = [
        ['Maestro/a',        meta.maestro],
        ['Área',             meta.area],
        ['Año escolaridad',  meta.año_escolaridad],
        ['Unidad educativa', meta.unidad_educativa],
        ['Estudiantes',      meta.cantidad_estudiantes],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '')
     .map(([l, v]) => `<div class="cn-meta-row">
        <span class="cn-meta-row__label">${l}</span>
        <span class="cn-meta-row__val">${_escapeHtml(String(v))}</span>
    </div>`).join('');

    const trimBadges = ['1TRIM','2TRIM','3TRIM'].map(t => {
        const tiene = meta[`${t}_tiene_notas`];
        return `<span style="font-size:.68rem;padding:2px 8px;border-radius:99px;font-weight:700;
            background:${tiene ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.04)'};
            border:1px solid ${tiene ? 'rgba(34,197,94,.25)' : 'var(--border-subtle)'};
            color:${tiene ? '#22c55e' : 'var(--text-muted)'};">${t}</span>`;
    }).join('');

    metaContent.innerHTML = metaRows
        + (Object.keys(meta).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 2px;">${trimBadges}</div>` : '');

    metaCard.style.display = '';

    // ── Panel derecho ────────────────────────────────────────────
    emptyState.style.display = 'none';

    if (!r.es_valido) {
        const items = (r.errores || []).map(e =>
            `<div class="cn-error-item">${_escapeHtml(e)}</div>`
        ).join('');
        errorState.innerHTML = `<ul class="cn-error-list">${items}</ul>`;
        errorState.style.display = '';
        notasData.style.display  = 'none';
        tableBadge.textContent   = `${(r.errores || []).length} error(es)`;

        // Advertencias si hay
        if (r.advertencias && r.advertencias.length) {
            errorState.innerHTML += `<div style="margin:0 20px 16px;padding:10px 14px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.18);border-radius:8px;">
                <p style="font-size:.75rem;font-weight:700;color:var(--warning);margin:0 0 4px;">Advertencias</p>
                <ul style="margin:0;padding-left:16px;">${r.advertencias.map(a =>
                    `<li style="font-size:.78rem;color:var(--text-muted);padding:2px 0;">${_escapeHtml(a)}</li>`
                ).join('')}</ul></div>`;
        }
        return;
    }

    // Planilla válida: mostrar tabla de notas + estudiantes
    errorState.style.display = 'none';
    const estudiantesHtml = r.estudiantes ? _renderEstudiantes(r.estudiantes) : '';
    const notasHtml       = r.notas       ? _renderNotas(r.notas)             : '';
    notasData.innerHTML   = `<div style="padding:0 20px 20px;">${estudiantesHtml}${notasHtml}</div>`;
    notasData.style.display = '';

    const total = meta.cantidad_estudiantes || '';
    tableBadge.textContent = total ? `${total} estudiantes` : '';
}

// ── Resetea el panel derecho y meta card ──────────────────────────
function _resetCnResult() {
    document.getElementById('cnEmptyState').style.display  = '';
    document.getElementById('cnErrorState').style.display  = 'none';
    document.getElementById('cnNotasData').style.display   = 'none';
    document.getElementById('cnMetaCard').style.display    = 'none';
    document.getElementById('cnTableBadge').textContent    = '';
}

function _renderResultado(r) {
    const meta = r.metadatos || {};

    if (!r.es_valido) {
        const items = r.errores.map(e =>
            `<li style="padding:4px 0;border-bottom:1px solid rgba(239,68,68,.1);font-size:.85rem;">${_escapeHtml(e)}</li>`
        ).join('');
        const estudiantesHtml = r.estudiantes ? _renderEstudiantes(r.estudiantes) : '';
        return `
            <div style="border:1px solid rgba(239,68,68,.35);border-radius:12px;overflow:hidden;">
                <div style="background:rgba(239,68,68,.1);padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(239,68,68,.2);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <span style="font-weight:700;font-size:.875rem;color:#ef4444;">Planilla inválida</span>
                </div>
                <ul style="margin:0;padding:12px 16px 12px 32px;color:var(--text);">${items}</ul>
            </div>
            ${estudiantesHtml}`;
    }

    const advertItems = r.advertencias && r.advertencias.length
        ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.25);border-radius:8px;">
               <p style="font-size:.78rem;font-weight:700;color:#ca8a04;margin:0 0 6px;">Advertencias</p>
               <ul style="margin:0;padding-left:16px;">${r.advertencias.map(a =>
                   `<li style="font-size:.8rem;color:var(--text);padding:2px 0;">${_escapeHtml(a)}</li>`
               ).join('')}</ul>
           </div>` : '';

    const trimBadge = t => {
        const tiene = meta[`${t}_tiene_notas`];
        return `<span style="font-size:.7rem;padding:2px 8px;border-radius:99px;font-weight:700;
            background:${tiene ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.05)'};
            border:1px solid ${tiene ? 'rgba(34,197,94,.3)' : 'var(--border)'};
            color:${tiene ? '#22c55e' : 'var(--text-muted)'};">
            ${t}: ${tiene ? 'Con notas' : 'Sin notas'}</span>`;
    };

    const notasHtml     = r.notas ? _renderNotas(r.notas) : '';
    const estudiantesHtml = r.estudiantes ? _renderEstudiantes(r.estudiantes) : '';

    return `
        <div style="border:1px solid rgba(34,197,94,.35);border-radius:12px;overflow:hidden;">
            <div style="background:rgba(34,197,94,.1);padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(34,197,94,.2);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style="font-weight:700;font-size:.875rem;color:#22c55e;">Planilla válida</span>
            </div>
            <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
                ${_metaRow('Maestro/a',        meta.maestro)}
                ${_metaRow('Área',             meta.area)}
                ${_metaRow('Año escolaridad',  meta.año_escolaridad)}
                ${_metaRow('Paralelo',         meta.paralelo)}
                ${_metaRow('Unidad educativa', meta.unidad_educativa)}
                ${_metaRow('Estudiantes',      meta.cantidad_estudiantes)}
                <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:4px;">
                    ${trimBadge('1TRIM')}${trimBadge('2TRIM')}${trimBadge('3TRIM')}
                </div>
                ${advertItems}
            </div>
        </div>
        ${estudiantesHtml}
        ${notasHtml}`;
}

function _renderEstudiantes(est) {
    const { activos, inactivos, no_encontrados, total_excel, total_bd, curso_verificado } = est;
    const encontrados = activos + inactivos;

    const contadores = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <span style="font-size:.75rem;padding:3px 10px;border-radius:99px;font-weight:700;
                background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#22c55e;">
                ${activos} activo${activos !== 1 ? 's' : ''}
            </span>
            ${inactivos > 0 ? `<span style="font-size:.75rem;padding:3px 10px;border-radius:99px;font-weight:700;
                background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.25);color:#ca8a04;">
                ${inactivos} inactivo${inactivos !== 1 ? 's' : ''}
            </span>` : ''}
            <span style="font-size:.75rem;padding:3px 10px;border-radius:99px;font-weight:600;
                background:var(--bg-hover);border:1px solid var(--border);color:var(--text-muted);">
                ${encontrados} / ${total_excel} del Excel · ${total_bd} en BD
            </span>
        </div>`;

    if (no_encontrados && no_encontrados.length > 0) {
        const lista = no_encontrados.slice(0, 10).map(n =>
            `<li style="padding:3px 0;font-size:.82rem;">${_escapeHtml(n)}</li>`
        ).join('');
        const masMsg = no_encontrados.length > 10
            ? `<li style="color:var(--text-muted);font-size:.8rem;">... y ${no_encontrados.length - 10} más</li>` : '';

        // Debug para diagnosticar el formato exacto de nombres
        const debugExcel = (est._debug_nombres_excel || []).map(n =>
            `<code style="display:block;font-size:.75rem;background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px;margin-bottom:2px;">${_escapeHtml(JSON.stringify(n))}</code>`
        ).join('');
        const debugBd = (est._debug_nombres_bd || []).map(n =>
            `<code style="display:block;font-size:.75rem;background:rgba(0,0,0,.2);padding:2px 6px;border-radius:4px;margin-bottom:2px;">${_escapeHtml(JSON.stringify(n))}</code>`
        ).join('');
        const debugHtml = (debugExcel || debugBd) ? `
            <details style="margin-top:10px;">
                <summary style="cursor:pointer;font-size:.78rem;color:var(--text-muted);user-select:none;">Debug: comparación de nombres</summary>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
                    <div><p style="font-size:.75rem;color:var(--text-muted);margin:0 0 4px;">Excel (primeros 5):</p>${debugExcel || '<em style="font-size:.75rem;color:var(--text-muted)">vacío</em>'}</div>
                    <div><p style="font-size:.75rem;color:var(--text-muted);margin:0 0 4px;">BD curso ${est._debug_curso_id} (primeros 5):</p>${debugBd || '<em style="font-size:.75rem;color:var(--text-muted)">vacío</em>'}</div>
                </div>
            </details>` : '';

        return `
        <div style="margin-top:10px;border:1px solid rgba(239,68,68,.3);border-radius:12px;overflow:hidden;">
            <div style="background:rgba(239,68,68,.08);padding:11px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(239,68,68,.15);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                <span style="font-weight:700;font-size:.85rem;color:#ef4444;">Estudiantes no encontrados en la BD</span>
            </div>
            <div style="padding:12px 16px;">
                <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 8px;">
                    Los siguientes estudiantes del Excel no existen en el curso
                    ${curso_verificado ? `<strong style="color:var(--text);">${_escapeHtml(curso_verificado)}</strong>` : 'asignado'}:
                </p>
                <ul style="margin:0;padding-left:20px;color:var(--text);">${lista}${masMsg}</ul>
                ${contadores}
                ${debugHtml}
            </div>
        </div>`;
    }

    return `
    <div style="margin-top:10px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="background:var(--bg-hover);padding:11px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
            <span style="font-weight:700;font-size:.85rem;color:var(--text);">Estudiantes verificados</span>
        </div>
        <div style="padding:12px 16px;">
            <p style="font-size:.83rem;color:var(--text-muted);margin:0;">
                Todos los estudiantes del Excel fueron encontrados en la base de datos del curso.
            </p>
            ${contadores}
        </div>
    </div>`;
}

function _renderNotas(notas) {
    const trimestres = notas.trimestres || {};
    const orden = ['1TRIM', '2TRIM', '3TRIM'];
    const labels = { '1TRIM': '1er Trimestre', '2TRIM': '2do Trimestre', '3TRIM': '3er Trimestre' };

    return orden.map(trim => {
        const td = trimestres[trim];
        if (!td) return '';

        const saberHtml = _renderTablaDimension(td.saber, 'SABER', '#6366f1', 45);
        const hacerHtml = _renderTablaDimension(td.hacer, 'HACER', '#0ea5e9', 40);

        const tieneDatos = (td.saber.casilleros.length > 0) || (td.hacer.casilleros.length > 0);

        return `
        <div style="margin-top:14px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.trim-chevron').style.transform=this.nextElementSibling.style.display==='none'?'rotate(0deg)':'rotate(180deg)';"
                style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-hover);border:none;cursor:pointer;color:var(--text);font-family:inherit;">
                <span style="font-weight:700;font-size:.9rem;">${labels[trim]}</span>
                <span style="display:flex;align-items:center;gap:8px;">
                    ${tieneDatos
                        ? `<span style="font-size:.7rem;color:#22c55e;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);padding:2px 8px;border-radius:99px;font-weight:700;">Con notas</span>`
                        : `<span style="font-size:.7rem;color:var(--text-muted);background:var(--bg-input);border:1px solid var(--border);padding:2px 8px;border-radius:99px;">Sin notas</span>`}
                    <svg class="trim-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s;transform:rotate(180deg);">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </span>
            </button>
            <div style="display:block;">
                ${saberHtml}
                ${hacerHtml}
                ${!tieneDatos ? '<p style="text-align:center;color:var(--text-muted);font-size:.85rem;padding:20px;">Sin notas registradas en este trimestre.</p>' : ''}
            </div>
        </div>`;
    }).join('');
}

function _renderTablaDimension(dim, titulo, color, maxPts) {
    if (!dim.casilleros.length) return '';

    const headers = dim.casilleros.map(c =>
        `<th style="min-width:80px;text-align:center;">${_escapeHtml(c)}</th>`
    ).join('');

    const filas = dim.datos.map(est => {
        const celdas = dim.casilleros.map(c => {
            const v = est.notas[c];
            return `<td style="text-align:center;font-variant-numeric:tabular-nums;">${v !== null && v !== undefined ? v : '<span style="color:var(--text-muted);">—</span>'}</td>`;
        }).join('');
        const prom = est.promedio;
        const promColor = prom === null || prom === undefined ? 'var(--text-muted)' :
            prom >= maxPts * 0.7 ? '#22c55e' : prom >= maxPts * 0.5 ? '#f59e0b' : '#ef4444';
        return `<tr>
            <td style="font-variant-numeric:tabular-nums;color:var(--text-muted);text-align:center;">${est.numero ?? ''}</td>
            <td style="white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${_escapeHtml(est.nombre)}</td>
            ${celdas}
            <td style="text-align:center;font-weight:700;color:${promColor};">${prom !== null && prom !== undefined ? prom : '—'}</td>
        </tr>`;
    }).join('');

    return `
    <div style="padding:14px 16px 0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="width:3px;height:16px;background:${color};border-radius:2px;display:inline-block;"></span>
            <span style="font-size:.8rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.06em;">${titulo} / ${maxPts} pts</span>
        </div>
    </div>
    <div style="overflow-x:auto;padding-bottom:14px;">
        <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
            <thead>
                <tr style="background:var(--bg-hover);">
                    <th style="padding:8px 10px;text-align:center;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">#</th>
                    <th style="padding:8px 10px;text-align:left;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;min-width:160px;">Estudiante</th>
                    ${headers.replace(/(<th)/g, '<th style="padding:8px 10px;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;"')}
                    <th style="padding:8px 10px;text-align:center;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">Promedio</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
    </div>`;
}

function _metaRow(label, valor) {
    if (!valor && valor !== 0) return '';
    return `<div style="display:flex;gap:8px;font-size:.85rem;">
        <span style="color:var(--text-muted);min-width:130px;flex-shrink:0;">${label}:</span>
        <span style="color:var(--text);font-weight:600;">${_escapeHtml(String(valor))}</span>
    </div>`;
}


// ── Cargar asignaciones para el panel de Notas ────────────────────
async function cargarAsignacionesNotas() {
    const grid = document.getElementById('notasClasesGrid');
    const countEl = document.getElementById('notasMateriasCount');
    const { ok, data } = await fetchAPI('/api/academics/profesor/mis-asignaciones/');

    if (!ok || !data || !data.length) {
        grid.innerHTML = `<div class="notas-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 9h6M9 13h6M9 17h4"/>
            </svg>
            <p>No tienes asignaciones registradas.</p>
        </div>`;
        if (countEl) countEl.textContent = '0 materias';
        return;
    }

    if (countEl) countEl.textContent = `${data.length} materia${data.length !== 1 ? 's' : ''}`;

    grid.innerHTML = data.map((a) => {
        const sinNotas = !a.tiene_notas;
        return `
        <div class="notas-clase-card${sinNotas ? ' notas-clase-card--sin-notas' : ''}">
            <div class="notas-clase-card__band"></div>
            <div class="notas-clase-card__body">
                <div class="notas-clase-card__top">
                    <span class="notas-clase-card__curso-tag">${_escapeHtml(a.materia_nombre)}</span>
                    <span class="notas-clase-card__icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
                    </span>
                </div>
                <p class="notas-clase-card__materia">${_escapeHtml(a.curso_nombre)}</p>
                <div class="notas-clase-card__footer">
                    <span class="notas-clase-card__planes">
                        ${sinNotas
                            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Sin registro`
                            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Con notas`
                        }
                    </span>
                    <button class="notas-clase-card__btn"
                            data-pc-id="${a.id}"
                            data-label="${_escapeHtml(a.materia_nombre)} — ${_escapeHtml(a.curso_nombre)}"
                            data-materia="${_escapeHtml(a.materia_nombre)}"
                            data-curso="${_escapeHtml(a.curso_nombre)}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        Gestionar
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.notas-clase-card__btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mesLabel = document.querySelector('.notas-folder-tab.active')?.textContent.trim() || '';
            _irASubirNotas(btn.dataset.pcId, btn.dataset.label, mesLabel, btn.dataset.materia, btn.dataset.curso);
        });
    });
}

// ── Folder tabs de meses (Marzo–Diciembre, meses futuros bloqueados) ─
function _initNotasFolderTabs() {
    const MESES_ESCOLAR = [
        { nombre: 'Marzo', idx: 2 }, { nombre: 'Abril',      idx: 3 },
        { nombre: 'Mayo',  idx: 4 }, { nombre: 'Junio',      idx: 5 },
        { nombre: 'Julio', idx: 6 }, { nombre: 'Agosto',     idx: 7 },
        { nombre: 'Sep.',  idx: 8 }, { nombre: 'Octubre',    idx: 9 },
        { nombre: 'Nov.',  idx:10 }, { nombre: 'Diciembre',  idx:11 },
    ];
    const mesActual  = new Date().getMonth(); // 0-based
    const container  = document.getElementById('notasFolderTabs');
    const periodLabel = document.getElementById('notasPeriodLabel');

    // El mes activo es el actual (o Marzo si estamos antes de Marzo)
    const mesActivoIdx = Math.max(mesActual, 2);

    container.innerHTML = MESES_ESCOLAR.map(({ nombre, idx }) => {
        const locked = idx > mesActual;
        const active = idx === mesActivoIdx;
        return `<button class="notas-folder-tab${active ? ' active' : ''}${locked ? ' locked' : ''}"
                        data-mes="${idx}" data-nombre="${nombre}" ${locked ? 'disabled' : ''}>
            ${nombre}${locked ? '<span class="tab-lock">🔒</span>' : ''}
        </button>`;
    }).join('');

    // Inicializar label del período activo
    const activeTab = container.querySelector('.active');
    if (activeTab && periodLabel) periodLabel.textContent = activeTab.dataset.nombre;

    container.addEventListener('click', e => {
        const btn = e.target.closest('.notas-folder-tab');
        if (!btn || btn.classList.contains('locked')) return;
        container.querySelectorAll('.notas-folder-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (periodLabel) periodLabel.textContent = btn.dataset.nombre;
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ── Navegación entre sub-vistas del panel Notas ───────────────────
function _initNotasNavigation() {
    document.getElementById('btnVolverClases').addEventListener('click', _irAVistaClases);
}

function _actualizarHeaderNotas(label, mes = '', materiaSel = '', cursoSel = '') {
    const partes = String(label || '').split(/\s+—\s+/);
    const materia = (partes.shift() || '').trim() || '—';
    const curso = partes.join(' — ').trim() || '—';
    const periodo = (mes || '').trim() || '—';

    document.getElementById('cnTitulo').textContent = 'Carga de Notas';
    document.getElementById('notasClaseSeleccionada').textContent = 'Revisa la planilla antes de validar y confirmar la carga.';
    document.getElementById('cnMateria').textContent = materiaSel || materia;
    document.getElementById('cnCurso').textContent = cursoSel || curso;
    document.getElementById('cnPeriodo').textContent = periodo;
}

function _irASubirNotas(pcId, label, mes = '', materia = '', curso = '') {
    document.getElementById('selectAsignacion').value = pcId;
    _actualizarHeaderNotas(label, mes, materia, curso);
    // Resetear estado de carga
    document.getElementById('dropZone').classList.remove('drop-zone--has-file');
    document.getElementById('nombreArchivo').textContent = '';
    document.getElementById('nombreArchivo').style.display = 'none';
    document.getElementById('excelInput').value = '';
    document.getElementById('btnSubirNotas').disabled = true;
    _resetCnResult();
    // Cambiar vista
    document.getElementById('vistaClases').style.display = 'none';
    document.getElementById('vistaSubirNotas').style.display = '';
}

function _irAVistaClases() {
    document.getElementById('vistaSubirNotas').style.display = 'none';
    document.getElementById('vistaClases').style.display = '';
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
    const { ok, data } = await fetchAPI('/api/academics/profesor/cursos/');
    if (!ok) return;

    _cursos = data;
    const sel = document.getElementById('citCurso');
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
        opt.textContent = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`;
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
let _planAsignaciones = [];         // ProfesorCurso[] del profesor
let _planPlanesCache  = {};         // { mes: { pc_id: [plan, ...] } }
let _planModalPcId    = null;
let _planModalMes     = null;
let _planModalEditable = true;
let _planHistCargado  = false;

function _initPlanForm() {
    // botón Ver historial
    const btn  = document.getElementById('btnVerHistorial');
    const wrap = document.getElementById('planHistorialWrap');

    btn.addEventListener('click', async () => {
        const visible = wrap.style.display !== 'none';
        if (visible) {
            wrap.style.display = 'none';
            btn.classList.remove('active');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> Ver planes pasados`;
        } else {
            wrap.style.display = 'block';
            btn.classList.add('active');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> Ocultar planes pasados`;
            if (!_planHistCargado) {
                await cargarHistorialPlanes();
                _planHistCargado = true;
            }
        }
    });

    // modal plan — cerrar
    document.getElementById('planModalClose').addEventListener('click', _cerrarPlanModal);
    document.getElementById('planModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarPlanModal();
    });

    // modal advertencia sin guardar
    document.getElementById('warnSinGuardarQuedarme').addEventListener('click', () => {
        document.getElementById('warnSinGuardarOverlay').classList.remove('visible');
    });
    document.getElementById('warnSinGuardarSalir').addEventListener('click', () => {
        document.getElementById('warnSinGuardarOverlay').classList.remove('visible');
        _forzarCerrarPlanModal();
    });

    // modal plan — guardar todos
    document.getElementById('planModalGuardar').addEventListener('click', _pedirConfirmGuardar);

    // confirmación antes de guardar
    const backdrop = document.getElementById('planConfirmBackdrop');
    document.getElementById('planConfirmCancelar').addEventListener('click', () => {
        backdrop.classList.remove('visible');
    });
    document.getElementById('planConfirmAceptar').addEventListener('click', async () => {
        backdrop.classList.remove('visible');
        await _guardarPlanesModal();
    });
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
    const fmt = d => d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
    return { display: `${fmt(inicio)} – ${fmt(fin)}` };
}

// ── Carga principal del mes actual ────────────────────────────────
async function cargarPlanes() {
    const grid    = document.getElementById('planAsigGrid');
    const spinner = document.getElementById('planSpinner');
    grid.style.display = 'none';
    spinner.style.display = 'flex';

    // Cargar asignaciones una sola vez
    if (!_planAsignaciones.length) {
        const { ok, data } = await fetchAPI('/api/academics/profesor/mis-asignaciones/');
        if (!ok) {
            spinner.style.display = 'none';
            showAppToast('error', 'Error', 'No se pudieron cargar las asignaciones.');
            return;
        }
        _planAsignaciones = data;
    }

    const mes = new Date().getMonth() + 1;
    await _refrescarPlanesCache(mes);

    spinner.style.display = 'none';
    grid.style.display = 'grid';
    _renderPlanCards(mes);
    _actualizarNotificaciones(mes);
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
    const grid = document.getElementById('planAsigGrid');
    const pcMap = _planPlanesCache[mes] || {};

    grid.innerHTML = _planAsignaciones.map(asig => {
        const plans = pcMap[asig.id] || [];
        const dots  = [1, 2, 3, 4].map(s => {
            const ok = plans.some(p => p.semana === s);
            return `<span class="plan-asig-week${ok ? '' : ' plan-asig-week--empty'}">${s}</span>`;
        }).join('');
        const complete = plans.length === 4;
        return `<div class="plan-asig-card${complete ? ' plan-asig-card--complete' : ''}" data-pc-id="${asig.id}" data-mes="${mes}">
            <div>
                <div class="plan-asig-card__materia">${_escapeHtml(asig.materia_nombre)}</div>
                <div class="plan-asig-card__curso">${_escapeHtml(asig.curso_nombre)}</div>
            </div>
            <div class="plan-asig-dots">${dots}</div>
            ${complete
                ? `<span class="plan-asig-card__badge-complete"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>Completo</span>`
                : `<div class="plan-asig-card__count">${plans.length} de 4 semanas</div>`
            }
        </div>`;
    }).join('');

    grid.querySelectorAll('.plan-asig-card').forEach(card => {
        card.addEventListener('click', () =>
            _abrirPlanModal(parseInt(card.dataset.pcId), parseInt(card.dataset.mes), true)
        );
    });
}

// ── Modal de plan por asignación ──────────────────────────────────
function _abrirPlanModal(pcId, mes, editable) {
    _planModalPcId     = pcId;
    _planModalMes      = mes;
    _planModalEditable = editable;

    const asig = _planAsignaciones.find(a => a.id === pcId);
    if (!asig) return;

    document.getElementById('planModalMateria').textContent = asig.materia_nombre;
    document.getElementById('planModalCurso').textContent   = asig.curso_nombre;
    _renderPlanModalTbody(pcId, mes, editable);
    document.getElementById('planModalOverlay').classList.add('visible');
}

function _cerrarPlanModal() {
    const hayContenido = [...document.querySelectorAll('#planModalTbody textarea')]
        .some(ta => ta.value.trim());
    if (hayContenido) {
        document.getElementById('warnSinGuardarOverlay').classList.add('visible');
        return;
    }
    _forzarCerrarPlanModal();
}

function _forzarCerrarPlanModal() {
    document.getElementById('planModalOverlay').classList.remove('visible');
    _planModalPcId = null;
    _planModalMes  = null;
}

function _renderPlanModalTbody(pcId, mes, editable) {
    const tbody  = document.getElementById('planModalTbody');
    const footer = document.getElementById('planModalFooter');
    const plans  = (_planPlanesCache[mes] || {})[pcId] || [];
    const mapa   = {};
    plans.forEach(p => { mapa[p.semana] = p; });

    tbody.innerHTML = '';
    let hayVacias = false;

    for (let semana = 1; semana <= 4; semana++) {
        const plan = mapa[semana] || null;
        const { display } = _periodoSemana(mes, semana);
        const tr = document.createElement('tr');

        const numCls     = plan ? 'plan-semana-num' : 'plan-semana-num plan-semana-num--empty';
        const semanaCell = `<td data-label="Semana"><span class="plan-semana-badge"><span class="${numCls}">${semana}</span>Semana ${semana}</span></td>`;
        const periodoCell = `<td data-label="Período"><span class="plan-periodo">${display}</span></td>`;

        if (plan) {
            tr.innerHTML = `${semanaCell}${periodoCell}
                <td data-label="Plan"><span class="plan-desc-text">${_escapeHtml(plan.descripcion)}</span></td>
                <td></td>`;
        } else {
            hayVacias = true;
            tr.innerHTML = `${semanaCell}${periodoCell}
                <td data-label="Plan">${editable
                    ? `<div class="plan-inline-form"><textarea data-semana="${semana}" placeholder="Plan de trabajo para la semana ${semana}… (mín. 20 caracteres)" maxlength="500" minlength="20"></textarea><span class="plan-inline-error"></span></div>`
                    : '<span class="plan-desc-vacia">Sin plan registrado</span>'
                }</td>
                <td></td>`;
        }
        tbody.appendChild(tr);
    }

    if (footer) footer.style.display = editable && hayVacias ? 'flex' : 'none';

    // Habilitar botón solo cuando todos los textareas tengan ≥ 20 chars
    if (editable && hayVacias) {
        const btn = document.getElementById('planModalGuardar');
        btn.disabled = true;
        tbody.querySelectorAll('textarea').forEach(ta => {
            ta.addEventListener('input', _actualizarBtnGuardar);
        });
    }
}

function _actualizarBtnGuardar() {
    const textareas = [...document.querySelectorAll('#planModalTbody textarea')];
    const btn = document.getElementById('planModalGuardar');
    if (!btn) return;
    btn.disabled = textareas.length === 0 || !textareas.every(ta => ta.value.trim().length >= 20);
}

function _pedirConfirmGuardar() {
    const asig  = _planAsignaciones.find(a => a.id === _planModalPcId);
    const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('planConfirmSub').textContent =
        `Estás a punto de registrar los planes de trabajo de ${meses[_planModalMes]} para:`;
    document.getElementById('planConfirmDetalle').innerHTML =
        `<span class="plan-confirm-tag">${_escapeHtml(asig.materia_nombre)}</span> &mdash; <span class="plan-confirm-tag">${_escapeHtml(asig.curso_nombre)}</span>`;
    document.getElementById('planConfirmBackdrop').classList.add('visible');
}

async function _guardarPlanesModal() {
    const textareas  = [...document.querySelectorAll('#planModalTbody textarea')];
    const pendientes = textareas.map(ta => ({ semana: parseInt(ta.dataset.semana), desc: ta.value.trim(), ta }));

    const btn = document.getElementById('planModalGuardar');
    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    let errores = 0;
    for (const { semana, desc, ta } of pendientes) {
        const { ok, data } = await fetchAPI('/api/academics/profesor/planes/', {
            method: 'POST',
            body: JSON.stringify({ mes: _planModalMes, semana, descripcion: desc, profesor_curso_id: _planModalPcId }),
        });
        if (!ok) {
            errores++;
            ta.classList.add('invalid');
            const err = ta.closest('.plan-inline-form')?.querySelector('.plan-inline-error');
            if (err) { err.textContent = data?.errores || 'Error al guardar.'; err.style.display = 'block'; }
        }
    }

    btn.textContent = 'Guardar planes';

    await _refrescarPlanesCache(_planModalMes);
    _renderPlanModalTbody(_planModalPcId, _planModalMes, true);
    _renderPlanCards(_planModalMes);
    _actualizarNotificaciones(_planModalMes);

    if (!errores) {
        showAppToast('success', 'Guardado', `Plan de trabajo registrado correctamente.`);
    }
}



// ── Verificación background (dot en sidebar) ──────────────────────
async function _verificarDotPlan() {
    // Necesita asignaciones para saber cuántos se esperan
    if (!_planAsignaciones.length) {
        const { ok, data } = await fetchAPI('/api/academics/profesor/mis-asignaciones/');
        if (!ok) return;
        _planAsignaciones = data;
    }
    const mes = new Date().getMonth() + 1;
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
    const pcMap     = _planPlanesCache[mes] || {};
    const incompleto = _planAsignaciones.some(a => (pcMap[a.id] || []).length < 4);
    document.getElementById('planDot').classList.toggle('visible', incompleto);
    document.getElementById('planBanner').classList.toggle('visible', incompleto);
    if (incompleto) document.getElementById('planBannerMes').textContent = MESES[mes];
}

// ── Historial ─────────────────────────────────────────────────────
async function cargarHistorialPlanes() {
    const content = document.getElementById('planHistorialContent');
    content.innerHTML = `<div class="historial-spinner" style="padding:32px 0;"><div class="spinner"></div></div>`;

    const { ok, data } = await fetchAPI('/api/academics/profesor/planes/historial/');
    if (!ok) {
        content.innerHTML = `<p class="plan-historial-vacio">Error al cargar el historial.</p>`;
        return;
    }
    if (!data.length) {
        content.innerHTML = `<p class="plan-historial-vacio">No hay planes de trabajo anteriores registrados.</p>`;
        return;
    }

    // Agrupar por mes → por pc_id
    const porMes = {};
    data.forEach(p => {
        if (!porMes[p.mes]) porMes[p.mes] = {};
        if (!porMes[p.mes][p.profesor_curso_id]) porMes[p.mes][p.profesor_curso_id] = [];
        porMes[p.mes][p.profesor_curso_id].push(p);
    });

    // Guardar en cache para que el modal pueda mostrar el contenido
    Object.entries(porMes).forEach(([mes, pcMap]) => {
        _planAsignaciones.forEach(a => { if (!pcMap[a.id]) pcMap[a.id] = []; });
        _planPlanesCache[parseInt(mes)] = pcMap;
    });

    const frag = document.createDocumentFragment();
    Object.keys(porMes).sort((a, b) => b - a).forEach(mesStr => {
        const mesNum = parseInt(mesStr);
        const pcMap  = porMes[mesStr];

        // Obtener pc_ids que tienen al menos 1 plan en este mes
        const pcIds = Object.keys(pcMap).map(Number).filter(id => pcMap[id].length > 0);

        const group = document.createElement('div');
        group.className = 'plan-historial-mes-group';

        const label = document.createElement('div');
        label.className = 'plan-historial-mes-label';
        label.textContent = MESES[mesNum];
        group.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'plan-asig-grid';
        grid.style.paddingTop = '8px';

        pcIds.forEach(pcId => {
            const plans = pcMap[pcId] || [];
            const asig  = _planAsignaciones.find(a => a.id === pcId);
            if (!asig) return;
            const dots = [1, 2, 3, 4].map(s => {
                const ok = plans.some(p => p.semana === s);
                return `<span class="plan-asig-week${ok ? '' : ' plan-asig-week--empty'}">${s}</span>`;
            }).join('');
            const complete2 = plans.length === 4;
            const card = document.createElement('div');
            card.className = `plan-asig-card${complete2 ? ' plan-asig-card--complete' : ''}`;
            card.innerHTML = `
                <div>
                    <div class="plan-asig-card__materia">${_escapeHtml(asig.materia_nombre)}</div>
                    <div class="plan-asig-card__curso">${_escapeHtml(asig.curso_nombre)}</div>
                </div>
                <div class="plan-asig-dots">${dots}</div>
                ${complete2
                    ? `<span class="plan-asig-card__badge-complete"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>Completo</span>`
                    : `<div class="plan-asig-card__count">${plans.length} de 4 semanas</div>`
                }`;
            card.addEventListener('click', () => _abrirPlanModal(pcId, mesNum, false));
            grid.appendChild(card);
        });

        group.appendChild(grid);
        frag.appendChild(group);
    });

    content.innerHTML = '';
    content.appendChild(frag);
}

function _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Historial de citaciones ───────────────────────────────────────
const CIT_CARD_CLASS = {
    PENDIENTE:  'cit-card--pendiente',
    ASISTIO:    'cit-card--asistio',
    NO_ASISTIO: 'cit-card--no_asistio',
    ATRASO:     'cit-card--atraso',
};

async function cargarHistorial() {
    const lista   = document.getElementById('listaCitaciones');
    const spinner = document.getElementById('historialSpinner');
    const empty   = document.getElementById('historialVacio');

    lista.innerHTML = '';
    spinner.style.display = 'flex';
    empty.style.display = 'none';

    const { ok, data } = await fetchAPI('/api/discipline/citaciones/');

    spinner.style.display = 'none';

    if (!ok || !data.length) {
        empty.style.display = 'block';
        return;
    }

    data.forEach(c => {
        const asistBadge = ASISTENCIA_BADGES[c.asistencia] || 'badge--neutral';
        const asistLabel = ASISTENCIA_LABELS[c.asistencia] || c.asistencia;
        const cardClass  = CIT_CARD_CLASS[c.asistencia] || '';
        const fechaEnvio = new Date(c.fecha_envio).toLocaleDateString('es-BO');
        const fechaLim   = c.fecha_limite_asistencia
            ? new Date(c.fecha_limite_asistencia + 'T00:00:00').toLocaleDateString('es-BO')
            : '—';

        const div = document.createElement('div');
        div.className = `cit-card ${cardClass}`;
        div.innerHTML = `
            <div class="cit-card__info">
                <span class="cit-card__estudiante">${_escapeHtml(c.estudiante_nombre)}</span>
                <div class="cit-card__meta">
                    <span>${_escapeHtml(c.curso)}</span>
                    <span>·</span>
                    <span>${MOTIVOS[c.motivo] || c.motivo}</span>
                    <span>·</span>
                    <span>Límite: ${fechaLim}</span>
                    <span>·</span>
                    <span>Enviada: ${fechaEnvio}</span>
                </div>
            </div>
            <div class="cit-card__badge">
                <span class="badge ${asistBadge}">${asistLabel}</span>
            </div>
        `;
        lista.appendChild(div);
    });
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
        document.getElementById('profileName').textContent = nombre;
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
    document.getElementById('profileName').textContent    = nombre;
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
        const { ok, data } = await fetchAPI('/api/academics/profesor/mis-asignaciones/');
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
