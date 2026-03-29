'use strict';

/* ================================================================
   academico.js — Gestión Académica (Director)
   Pivots: Por Profesor | Por Curso | Materias | Planes de Trabajo
   ================================================================ */

// ── Estado global ─────────────────────────────────────────────────
let _vpAsignaciones = [];
let _vpProfesores   = [];
let _vpProfSelId    = null;
let _vpPlanesData   = [];   // planes del mes actual para indicadores
let _pivotActivo    = 'profesores';
let _vcAsigs        = [];
let _vcPanelCursoId = null;

// ── Helpers generales ─────────────────────────────────────────────
function _iniciales(nombre) {
    const parts = nombre.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _mostrarError(msgId, containerId, texto) {
    const container = document.getElementById(containerId);
    const msg       = document.getElementById(msgId);
    msg.textContent         = texto;
    container.style.display = 'flex';
}

function _ocultarError(containerId) {
    document.getElementById(containerId).style.display = 'none';
}

const _TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
</svg>`;

const _WARN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
</svg>`;

// ════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    _initSidebar();
    _initLogout();
    _initUserInfo();
    _initPivots();
    _initModalNuevaAsig();
    _initPlanDetalleModal();
    // Cargar vista por defecto
    _cargarVistaProfesor();
    cargarMaterias(); // precarga silenciosa
});

// ── Sidebar ───────────────────────────────────────────────────────
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

    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open')
            ? (sidebar.classList.remove('sidebar--open'), backdrop.classList.remove('visible'))
            : (sidebar.classList.add('sidebar--open'),    backdrop.classList.add('visible'))
    );
    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('sidebar--open');
        backdrop.classList.remove('visible');
    });
}

function _initLogout() {
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });
}

function _initUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;
    const nombre = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    document.getElementById('profileName').textContent = nombre;
    document.getElementById('profileRole').textContent = user.tipo_usuario || 'Director';
}

// ════════════════════════════════════════════════════════════════
// PIVOTS
// ════════════════════════════════════════════════════════════════

function _initPivots() {
    document.querySelectorAll('.acad-pivot').forEach(btn => {
        btn.addEventListener('click', () => _activarPivot(btn.dataset.pivot));
    });
}

async function _activarPivot(pivot) {
    if (_pivotActivo === pivot) return;
    _pivotActivo = pivot;

    document.querySelector('.main-content').scrollTop = 0;

    document.querySelectorAll('.acad-pivot').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-pivot="${pivot}"]`).classList.add('active');

    document.querySelectorAll('.acad-vista').forEach(v => v.classList.remove('active'));

    switch (pivot) {
        case 'profesores':
            document.getElementById('vistaProfesores').classList.add('active');
            await _cargarVistaProfesor();
            break;
        case 'cursos':
            document.getElementById('vistaCursos').classList.add('active');
            await _cargarVistaCursos();
            break;
        case 'materias':
            document.getElementById('vistaMaterias').classList.add('active');
            await cargarMaterias();
            break;
        case 'planes':
            document.getElementById('vistaPlanes').classList.add('active');
            await _cargarPlanes();
            break;
    }
}

// ════════════════════════════════════════════════════════════════
// MODAL NUEVA ASIGNACIÓN
// ════════════════════════════════════════════════════════════════

function _initModalNuevaAsig() {
    const modal = document.getElementById('modalNuevaAsig');

    document.getElementById('btnNuevaAsig').addEventListener('click', async () => {
        _ocultarError('errorAsignacion');
        modal.classList.add('visible');
        await cargarSelectores();
    });

    document.getElementById('btnCancelNuevaAsig').addEventListener('click', () => {
        modal.classList.remove('visible');
    });

    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('visible');
    });
}

// ════════════════════════════════════════════════════════════════
// VISTA POR PROFESOR
// ════════════════════════════════════════════════════════════════

async function _cargarVistaProfesor() {
    const vpProfList = document.getElementById('vpProfList');
    vpProfList.innerHTML = '<div class="spinner-inline"></div>';

    const mesActual = new Date().getMonth() + 1;
    const [resAsig, resUsers, resPlanes] = await Promise.all([
        fetchAPI('/api/academics/asignaciones/'),
        fetchAPI('/api/users/'),
        fetchAPI(`/api/academics/director/planes/?mes=${mesActual}`),
    ]);

    _vpAsignaciones = resAsig.data   || [];
    _vpProfesores   = (resUsers.data?.usuarios || []).filter(u => u.rol === 'Profesor');
    _vpPlanesData   = resPlanes.data || [];

    const porProf = {};
    for (const a of _vpAsignaciones) {
        if (!porProf[a.profesor]) {
            porProf[a.profesor] = { id: a.profesor, nombre: a.profesor_nombre, asigs: [] };
        }
        porProf[a.profesor].asigs.push(a);
    }

    const prioridadEstado = { red: 0, orange: 1, green: 2 };
    const grupos = Object.values(porProf).sort((a, b) => {
        const prioA = prioridadEstado[_planStatus(a.asigs)] ?? 99;
        const prioB = prioridadEstado[_planStatus(b.asigs)] ?? 99;
        if (prioA !== prioB) return prioA - prioB;
        return a.nombre.localeCompare(b.nombre);
    });
    _renderVpSidebar(grupos);
}

function _planStatus(profAsigs) {
    // semanasPorPc: cuántas semanas distintas tiene cada asignación
    const totales = profAsigs.length;
    if (!totales) return null;

    let completas = 0;
    let algunas   = 0;
    for (const a of profAsigs) {
        const semanas = new Set(
            _vpPlanesData.filter(p => p.profesor_curso_id === a.id).map(p => p.semana)
        ).size;
        if (semanas >= 4) completas++;
        else if (semanas > 0) algunas++;
    }

    if (completas === totales)           return 'green';   // todas completas
    if (completas > 0 || algunas > 0)    return 'orange';  // algunas
    return 'red';                                           // ninguna
}

function _renderVpSidebar(grupos) {
    const vpProfList = document.getElementById('vpProfList');

    if (!grupos.length) {
        vpProfList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:.85rem;">Sin asignaciones registradas.</div>';
        return;
    }

    vpProfList.innerHTML = grupos.map(g => {
        const status   = _planStatus(g.asigs);
        const dotHtml  = status
            ? `<span class="vp-plan-dot vp-plan-dot--${status}" title="${status === 'green' ? 'Planes completos' : status === 'orange' ? 'Planes incompletos' : 'Sin planes este mes'}"></span>`
            : '';
        return `
        <div class="vp-prof-item" data-prof-id="${g.id}">
            <div class="vp-avatar-wrap">
                <div class="vp-prof-avatar">${_iniciales(g.nombre)}</div>
                ${dotHtml}
            </div>
            <div class="vp-prof-info">
                <div class="vp-prof-name">${_escapeHtml(g.nombre)}</div>
                <div class="vp-prof-cargas">${g.asigs.length} carga${g.asigs.length !== 1 ? 's' : ''} académica${g.asigs.length !== 1 ? 's' : ''}</div>
            </div>
            <svg class="vp-prof-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
            </svg>
        </div>`;
    }).join('');

    vpProfList.querySelectorAll('.vp-prof-item').forEach(item => {
        item.addEventListener('click', () => {
            vpProfList.querySelectorAll('.vp-prof-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const profId = Number(item.dataset.profId);
            _vpProfSelId = profId;
            _renderVpCards(grupos.find(g => g.id === profId));
        });
    });

    // Auto-seleccionar el primero (o el último seleccionado)
    const target = _vpProfSelId
        ? vpProfList.querySelector(`[data-prof-id="${_vpProfSelId}"]`)
        : null;
    (target || vpProfList.querySelector('.vp-prof-item'))?.click();
}

function _renderVpCards(grupo) {
    const vpContent = document.getElementById('vpContent');

    const profUser    = _vpProfesores.find(p => p.id === grupo.id);
    const username    = profUser?.username || '—';
    const nCursos     = new Set(grupo.asigs.map(a => a.curso)).size;
    const nMaterias   = new Set(grupo.asigs.map(a => a.materia)).size;

    let anioIngreso = '—';
    if (profUser?.date_joined) anioIngreso = new Date(profUser.date_joined).getFullYear();
    let lastLogin = '—';
    if (profUser?.last_login) {
        lastLogin = new Date(profUser.last_login)
            .toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // ── Planes de este profesor este mes ──────────────────────
    const mesActual  = new Date().getMonth() + 1;
    const mesesNombre = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const planesProf = _vpPlanesData.filter(p => p.profesor_id === grupo.id);
    let planesHtml;
    if (!planesProf.length) {
        planesHtml = `<div class="vp-plan-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
            </svg>
            <span>Sin plan de trabajo aún</span>
            <small>${mesesNombre[mesActual]}</small>
        </div>`;
    } else {
        planesHtml = planesProf
            .sort((a, b) => a.semana - b.semana || a.materia_nombre.localeCompare(b.materia_nombre))
            .map(p => {
                const fi = p.fecha_inicio ? new Date(p.fecha_inicio + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) : '';
                const ff = p.fecha_fin   ? new Date(p.fecha_fin   + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) : '';
                const rango = (fi && ff) ? `${fi} – ${ff}` : '';
                return `
                <div class="vp-plan-row">
                    <div class="vp-plan-semana-badge">S${p.semana}</div>
                    <div class="vp-plan-body">
                        <div class="vp-plan-meta">
                            <span class="vp-plan-materia">${_escapeHtml(p.materia_nombre)}</span>
                            <span class="vp-plan-curso-tag">${_escapeHtml(p.curso_nombre)}</span>
                        </div>
                        <div class="vp-plan-desc">${_escapeHtml(p.descripcion)}</div>
                        ${rango ? `<div class="vp-plan-rango">${rango}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
    }

    // ── Agrupar asignaciones por materia ──────────────────────
    const porMateria = {};
    for (const a of grupo.asigs) {
        if (!porMateria[a.materia]) {
            porMateria[a.materia] = { nombre: a.materia_nombre, asigs: [] };
        }
        porMateria[a.materia].asigs.push(a);
    }
    const grupos = Object.values(porMateria).sort((a, b) => a.nombre.localeCompare(b.nombre));

    const filasHtml = grupos.map((m, idx) => {
        const color = _MATERIA_COLORS[idx % _MATERIA_COLORS.length];
        const initials = m.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const cursosHtml = m.asigs.map(a => {
            const tienePlan = _vpPlanesData.some(p => p.profesor_curso_id === a.id);
            const dotCls    = tienePlan ? 'vp-pc-dot--ok' : 'vp-pc-dot--miss';
            return `
            <div class="vp-curso-row" data-pc-id="${a.id}" data-curso-label="${_escapeHtml(a.curso_nombre)} — ${_escapeHtml(a.materia_nombre)}">
                <span class="vp-pc-dot ${dotCls}"></span>
                <span class="vp-curso-nombre">${_escapeHtml(a.curso_nombre)}</span>
                <button class="vp-curso-del" data-asig-id="${a.id}"
                    data-profesor="${_escapeHtml(a.profesor_nombre)}"
                    data-curso="${_escapeHtml(a.curso_nombre)}"
                    data-materia="${_escapeHtml(a.materia_nombre)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Quitar
                </button>
            </div>`;
        }).join('');
        return `
        <div class="vp-mat-group">
            <div class="vp-mat-group-head">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="vp-mat-group-icon" style="background:${color}22;color:${color}">${initials}</div>
                    <span class="vp-mat-group-name">${_escapeHtml(m.nombre)}</span>
                </div>
                <span class="vp-mat-group-count">${m.asigs.length} ${m.asigs.length === 1 ? 'curso' : 'cursos'}</span>
            </div>
            <div class="vp-curso-grid">${cursosHtml}</div>
        </div>`;
    }).join('');

    vpContent.innerHTML = `
        <!-- Cabecera — ocupa ambas columnas -->
        <div class="vp-header-card-full">
            <div class="vp-prof-header-card">
                <div class="vp-avatar-lg">${_iniciales(grupo.nombre)}</div>
                <div class="vp-header-info">
                    <div class="vp-header-name">${_escapeHtml(grupo.nombre)}</div>
                    <div class="vp-header-meta">
                        <span class="vp-header-badge">Profesor</span>
                    </div>
                </div>
            </div>
        </div>
        <!-- Tarjeta 1: Materias -->
        <div class="vp-card">
            <div class="vp-mat-section">
                <div class="vp-panel-head">
                    <span>Materias y cursos</span>
                    <span class="vp-plan-count" id="vpPlanCount"></span>
                </div>
                <div class="vp-mat-rows">
                    ${filasHtml.length ? filasHtml : `<div class="empty-state" style="padding:40px 16px;">Sin asignaciones registradas.</div>`}
                </div>
                <div class="vp-mat-add-row" id="btnAddAsigProf">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Añadir materia / curso
                </div>
            </div>
        </div>
        <!-- Tarjeta 2: Plan de trabajo -->
        <div class="vp-card">
            <div class="vp-panel-head vp-planes-head">
                <span>Plan de trabajo</span>
                <div class="vp-planes-controls">
                    <div class="vp-mes-select-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <select class="vp-mes-select" id="vpMesSel">
                            ${mesesNombre.slice(1).map((n,i) => `<option value="${i+1}"${i+1===mesActual?' selected':''}>${n}</option>`).join('')}
                        </select>
                    </div>
                    <button class="vp-export-btn" id="vpExportBtn" title="Exportar plan de este profesor">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Exportar
                    </button>
                </div>
            </div>
            <div class="vp-planes-rows" id="vpPlanesRows">
                ${planesHtml}
            </div>
        </div>`;

    // ── Selector de mes + filtro por curso ────────────────────
    const vpMesSel     = document.getElementById('vpMesSel');
    const vpPlanesRows = document.getElementById('vpPlanesRows');
    const vpExportBtn  = document.getElementById('vpExportBtn');
    let _currentPlanes = [...planesProf];   // planes ya cargados del mes actual
    let _activePcId    = null;              // fila de curso activa (filtro)

    function _planRowHtml(p) {
        const fi = p.fecha_inicio ? new Date(p.fecha_inicio+'T00:00:00').toLocaleDateString('es-BO',{day:'2-digit',month:'short'}) : '';
        const ff = p.fecha_fin   ? new Date(p.fecha_fin  +'T00:00:00').toLocaleDateString('es-BO',{day:'2-digit',month:'short'}) : '';
        const rango = (fi && ff) ? `${fi} – ${ff}` : '';
        return `
        <div class="vp-plan-row">
            <div class="vp-plan-semana-badge">S${p.semana}</div>
            <div class="vp-plan-body">
                <div class="vp-plan-meta">
                    <span class="vp-plan-materia">${_escapeHtml(p.materia_nombre)}</span>
                    <span class="vp-plan-curso-tag">${_escapeHtml(p.curso_nombre)}</span>
                </div>
                <div class="vp-plan-desc">${_escapeHtml(p.descripcion)}</div>
                ${rango ? `<div class="vp-plan-rango">${rango}</div>` : ''}
            </div>
        </div>`;
    }

    function _renderPlanes(planes, pcId) {
        const filtrados = pcId ? planes.filter(p => p.profesor_curso_id === pcId) : planes;
        if (!filtrados.length) {
            const label = pcId
                ? vpContent.querySelector(`.vp-curso-row[data-pc-id="${pcId}"]`)?.dataset.cursoLabel || ''
                : mesesNombre[Number(vpMesSel.value)];
            vpPlanesRows.innerHTML = `
                <div class="vp-plan-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="9" y1="13" x2="15" y2="13"/>
                    </svg>
                    <span>${pcId ? 'Sin plan para' : 'Sin plan de trabajo en'}</span>
                    <small>${_escapeHtml(label)}</small>
                </div>`;
        } else {
            vpPlanesRows.innerHTML = filtrados
                .sort((a,b) => a.semana - b.semana || a.materia_nombre.localeCompare(b.materia_nombre))
                .map(_planRowHtml).join('');
        }
    }

    function _actualizarIndicadores() {
        const mes    = Number(vpMesSel.value);
        const total  = grupo.asigs.length;
        let conPlan  = 0;
        vpContent.querySelectorAll('.vp-curso-row[data-pc-id]').forEach(row => {
            const pcId = Number(row.dataset.pcId);
            const ok   = _currentPlanes.some(p => p.profesor_curso_id === pcId);
            if (ok) conPlan++;
            row.querySelector('.vp-pc-dot')?.classList.toggle('vp-pc-dot--ok',   ok);
            row.querySelector('.vp-pc-dot')?.classList.toggle('vp-pc-dot--miss', !ok);
        });
        const countEl = document.getElementById('vpPlanCount');
        if (!countEl) return;
        const cls = conPlan === total ? 'vp-plan-count--ok'
                  : conPlan === 0    ? 'vp-plan-count--miss'
                  :                    'vp-plan-count--partial';
        countEl.className = `vp-plan-count ${cls}`;
        countEl.textContent = `Planes ${mesesNombre[mes]}: ${conPlan}/${total}`;
    }

    async function _recargarPlanesMes(mes) {
        vpPlanesRows.innerHTML = '<div class="spinner-inline" style="padding:24px 0;justify-content:center;display:flex;"></div>';
        vpExportBtn.disabled = true;
        _activePcId = null;
        vpContent.querySelectorAll('.vp-curso-row.active').forEach(r => r.classList.remove('active'));
        const res = await fetchAPI(`/api/academics/director/planes/?mes=${mes}&profesor_id=${grupo.id}`);
        _currentPlanes = res.ok ? (res.data || []) : [];
        _actualizarIndicadores();
        vpExportBtn.disabled = _currentPlanes.length === 0;
        _renderPlanes(_currentPlanes, null);
    }

    // Clic en fila de curso → filtrar planes
    vpContent.querySelectorAll('.vp-curso-row[data-pc-id]').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('.vp-curso-del')) return;  // ignorar botón quitar
            const pcId = Number(row.dataset.pcId);
            if (_activePcId === pcId) {
                // Deseleccionar → mostrar todos
                _activePcId = null;
                row.classList.remove('active');
                _renderPlanes(_currentPlanes, null);
            } else {
                vpContent.querySelectorAll('.vp-curso-row.active').forEach(r => r.classList.remove('active'));
                _activePcId = pcId;
                row.classList.add('active');
                _renderPlanes(_currentPlanes, pcId);
            }
        });
    });

    vpMesSel.addEventListener('change', () => _recargarPlanesMes(Number(vpMesSel.value)));

    vpExportBtn.addEventListener('click', async () => {
        const mes = Number(vpMesSel.value);
        vpExportBtn.disabled = true;
        const token = localStorage.getItem('access_token');
        try {
            const res = await fetch(`/api/academics/director/planes/exportar/?mes=${mes}&profesor_id=${grupo.id}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) {
                showToast('No se pudo generar el Excel.', 'error');
                return;
            }
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `plan_trabajo_${_escapeHtml(grupo.nombre).replace(/ /g,'_')}_${mesesNombre[mes].toLowerCase()}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            vpExportBtn.disabled = false;
        }
    });

    // habilitar exportar solo si hay planes en el mes actual
    vpExportBtn.disabled = planesProf.length === 0;
    _actualizarIndicadores();

    document.getElementById('btnAddAsigProf').addEventListener('click', async () => {
        document.getElementById('modalNuevaAsig').classList.add('visible');
        await cargarSelectores();
        const sel = document.getElementById('selProfesor');
        if (sel) sel.value = grupo.id;
    });

    vpContent.querySelectorAll('.vp-curso-del').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            eliminarAsignacion(
                btn.dataset.asigId,
                btn.dataset.profesor,
                btn.dataset.curso,
                btn.dataset.materia,
                async () => { await _cargarVistaProfesor(); }
            );
        });
    });
}

function _asigCardHtml(a) {
    return `
        <div class="asig-card" data-id="${a.id}">
            <span class="asig-badge-curso">${_escapeHtml(a.curso_nombre)}</span>
            <div class="asig-card__materia">${_escapeHtml(a.materia_nombre)}</div>
            <div class="asig-card__actions">
                <button class="asig-card__btn asig-card__btn--del asig-btn-del">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                    Eliminar
                </button>
                <button class="asig-card__btn asig-card__btn--edit asig-btn-edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Cambiar
                </button>
            </div>
        </div>`;
}

function _activarModoEdicion(card, asig, grupo) {
    card.classList.add('editing');

    const otrosProfesores = _vpProfesores.filter(p => p.id !== asig.profesor);
    const opciones = otrosProfesores.map(p =>
        `<option value="${p.id}">${`${p.first_name} ${p.last_name}`.trim() || p.username}</option>`
    ).join('');

    card.innerHTML = `
        <div class="asig-edit-header">
            <div>
                <div class="asig-card__materia">${asig.materia_nombre}</div>
                <div class="asig-card__curso">${asig.curso_nombre}</div>
            </div>
            <button class="asig-edit-close" id="btnEditCancelar" title="Cancelar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <p class="asig-edit-label">Nuevo profesor</p>
        <select class="asig-edit-select" id="selNuevoProf">
            <option value="">— Selecciona —</option>
            ${opciones}
        </select>
        <button class="asig-card__btn asig-card__btn--edit" id="btnEditGuardar" style="margin-top:4px;">Guardar cambio</button>`;

    card.querySelector('#btnEditCancelar').addEventListener('click', () => {
        _renderVpCards(grupo);
    });

    card.querySelector('#btnEditGuardar').addEventListener('click', () => {
        const nuevoProfId = Number(card.querySelector('#selNuevoProf').value);
        if (!nuevoProfId) { showToast('Selecciona un profesor.', 'error'); return; }
        const nuevoProf   = _vpProfesores.find(p => p.id === nuevoProfId);
        const nombreNuevo = `${nuevoProf.first_name} ${nuevoProf.last_name}`.trim();

        _abrirDelModal({
            nombre:       `${asig.materia_nombre} — ${asig.curso_nombre}`,
            confirmLabel: 'Confirmar cambio',
            toastMsg:     `Profesor cambiado a ${nombreNuevo} correctamente.`,
            warnings: [
                `${asig.profesor_nombre} dejará de dar ${asig.materia_nombre} en ${asig.curso_nombre}.`,
                `${nombreNuevo} será asignado en su lugar.`,
            ],
            action: async () => {
                const r1 = await fetchAPI(`/api/academics/asignaciones/${asig.id}/`, { method: 'DELETE' });
                if (!r1.ok) return r1;
                return fetchAPI('/api/academics/asignaciones/', {
                    method: 'POST',
                    body: JSON.stringify({ profesor: nuevoProfId, curso: asig.curso, materia: asig.materia }),
                });
            },
            onSuccess: async () => {
                _vpProfSelId = nuevoProfId;
                await _cargarVistaProfesor();
            },
        });
    });
}

// ════════════════════════════════════════════════════════════════
// VISTA POR CURSO — Split layout
// ════════════════════════════════════════════════════════════════

// Paleta de colores para iconos de materias
const _MATERIA_COLORS = [
    { bg: 'rgba(59,130,246,.18)',  color: '#60a5fa' },
    { bg: 'rgba(74,222,128,.15)',  color: '#4ade80' },
    { bg: 'rgba(251,191,36,.15)',  color: '#fbbf24' },
    { bg: 'rgba(239,68,68,.15)',   color: '#f87171' },
    { bg: 'rgba(167,139,250,.18)', color: '#c4b5fd' },
    { bg: 'rgba(45,212,191,.15)',  color: '#2dd4bf' },
    { bg: 'rgba(251,113,133,.15)', color: '#fb7185' },
];

async function _cargarVistaCursos() {
    const grid = document.getElementById('cursosGrid');
    grid.innerHTML = '<div class="spinner-inline"></div>';

    const [resCursos, resAsig] = await Promise.all([
        fetchAPI('/api/academics/cursos/'),
        fetchAPI('/api/academics/asignaciones/'),
    ]);

    const cursos = resCursos.data || [];
    _vcAsigs     = resAsig.data  || [];

    if (!cursos.length) {
        grid.innerHTML = '<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>Sin cursos registrados</div>';
        return;
    }

    const cards = cursos.map(c => {
        const nMaterias = _vcAsigs.filter(a => a.curso === c.id).length;
        const nombre    = `${c.grado} "${c.paralelo}"`;
        const isActive  = _vcPanelCursoId === c.id;
        const badgeCls  = isActive ? 'vc-card-badge--sel' : (nMaterias ? 'vc-card-badge--ok' : 'vc-card-badge--warn');
        const badgeTxt  = isActive ? 'SELECCIONADO' : (nMaterias ? 'DISPONIBLE' : 'SIN MATERIAS');
        const valCls    = nMaterias === 0 ? ' vc-card-stat-val--warn' : '';
        return `
            <div class="vc-course-card${isActive ? ' active' : ''}" data-curso-id="${c.id}">
                <div class="vc-card-head">
                    <div class="vc-card-name">${_escapeHtml(nombre)}</div>
                    <span class="vc-card-badge ${badgeCls}">${badgeTxt}</span>
                </div>
                <div class="vc-card-divider"></div>
                <div class="vc-card-stats">
                    <div class="vc-card-stat-row">
                        <span class="vc-card-stat-label">Estudiantes</span>
                        <span class="vc-card-stat-val">${c.estudiantes_count ?? '—'}</span>
                    </div>
                    <div class="vc-card-stat-row">
                        <span class="vc-card-stat-label">Materias</span>
                        <span class="vc-card-stat-val${valCls}">${nMaterias}</span>
                    </div>
                </div>
            </div>`;
    }).join('');

    grid.innerHTML = `<div class="vc-courses-grid">${cards}</div>`;

    grid.querySelectorAll('.vc-course-card').forEach(card => {
        card.addEventListener('click', () => {
            grid.querySelectorAll('.vc-course-card').forEach(c => {
                c.classList.remove('active');
                c.querySelector('.vc-card-badge').className = 'vc-card-badge vc-card-badge--ok';
                c.querySelector('.vc-card-badge').textContent = 'DISPONIBLE';
            });
            card.classList.add('active');
            card.querySelector('.vc-card-badge').className = 'vc-card-badge vc-card-badge--sel';
            card.querySelector('.vc-card-badge').textContent = 'SELECCIONADO';

            const cursoId = parseInt(card.dataset.cursoId);
            const nombre  = _escapeHtml(
                cursos.find(c => c.id === cursoId)
                    ? `${cursos.find(c => c.id === cursoId).grado} "${cursos.find(c => c.id === cursoId).paralelo}"`
                    : card.querySelector('.vc-card-name').textContent
            );
            const nEstu   = cursos.find(c => c.id === cursoId)?.estudiantes_count ?? 0;
            _abrirVcDetail(cursoId, nombre, nEstu);
        });
    });

    // Si ya había un curso seleccionado, re-seleccionarlo
    if (_vcPanelCursoId) {
        const prev = grid.querySelector(`[data-curso-id="${_vcPanelCursoId}"]`);
        if (prev) prev.click();
    }
}

function _abrirVcDetail(cursoId, nombre, nEstu) {
    _vcPanelCursoId = cursoId;
    const split  = document.getElementById('vcSplit');
    const panel  = document.getElementById('vcDetail');
    const asigs  = _vcAsigs.filter(a => a.curso === cursoId);

    const year = new Date().getFullYear();

    const materiasHtml = asigs.length
        ? asigs.map((a, i) => {
            const col   = _MATERIA_COLORS[i % _MATERIA_COLORS.length];
            const inits = a.materia_nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
            return `
                <div class="vc-materia-row">
                    <div class="vc-materia-icon" style="background:${col.bg};color:${col.color};">${inits}</div>
                    <div class="vc-materia-info">
                        <div class="vc-materia-name">${_escapeHtml(a.materia_nombre)}</div>
                        <div class="vc-materia-prof">Prof. ${_escapeHtml(a.profesor_nombre)}</div>
                    </div>
                    <button class="btn-del" style="flex-shrink:0;"
                        data-asig-id="${a.id}"
                        data-profesor="${_escapeHtml(a.profesor_nombre)}"
                        data-curso="${nombre}"
                        data-materia="${_escapeHtml(a.materia_nombre)}">
                        ${_TRASH_ICON}
                    </button>
                </div>`;
        }).join('')
        : `<div class="empty-state" style="padding:32px 16px;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>
                Sin materias asignadas
            </div>`;

    panel.innerHTML = `
        <div class="vc-detail-head">
            <div class="vc-detail-head-row">
                <div>
                    <div class="vc-detail-label">Carga Académica</div>
                    <div class="vc-detail-title">${nombre}</div>
                </div>
                <button class="vc-detail-close" id="vcDetailClose">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="vc-detail-tags">
                <span class="vc-detail-tag vc-detail-tag--year">${year}</span>
                ${nEstu ? `<span class="vc-detail-tag vc-detail-tag--stu">${nEstu} estudiante${nEstu !== 1 ? 's' : ''}</span>` : ''}
                <span class="vc-detail-tag vc-detail-tag--year">${asigs.length} materia${asigs.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
        <div class="vc-detail-body">${materiasHtml}</div>
        <div class="vc-detail-footer">
            <button class="vc-btn-planilla" id="vcBtnPlanilla">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Imprimir Planilla de Curso
            </button>
        </div>`;

    split.classList.add('has-panel');

    document.getElementById('vcDetailClose').addEventListener('click', _cerrarVcDetail);

    panel.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => {
            eliminarAsignacion(
                btn.dataset.asigId,
                btn.dataset.profesor,
                btn.dataset.curso,
                btn.dataset.materia,
                async () => {
                    await _cargarVistaCursos();
                },
            );
        });
    });
}

function _cerrarVcDetail() {
    document.getElementById('vcSplit').classList.remove('has-panel');
    document.getElementById('vcDetail').innerHTML = '';
    document.querySelectorAll('.vc-course-card').forEach(c => {
        c.classList.remove('active');
        const badge = c.querySelector('.vc-card-badge');
        if (badge) {
            badge.className = 'vc-card-badge vc-card-badge--ok';
            badge.textContent = 'DISPONIBLE';
        }
    });
    _vcPanelCursoId = null;
}

// ════════════════════════════════════════════════════════════════
// VISTA MATERIAS
// ════════════════════════════════════════════════════════════════

async function cargarMaterias() {
    const spinner = document.getElementById('spinnerMaterias');
    const wrap    = document.getElementById('wrapMaterias');
    const empty   = document.getElementById('emptyMaterias');
    const tbody   = document.getElementById('tbodyMaterias');

    spinner.style.display = 'flex';
    wrap.style.display    = 'none';
    empty.style.display   = 'none';

    const { ok, data } = await fetchAPI('/api/academics/materias/');
    spinner.style.display = 'none';

    if (!ok || !data.length) {
        empty.style.display = 'flex';
        return;
    }

    tbody.innerHTML = '';
    data.forEach((m, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="num-cell">${i + 1}</td>
            <td class="name-cell">
                <span class="chip chip--blue">${_escapeHtml(m.nombre)}</span>
            </td>
            <td style="text-align:right;padding-right:18px;">
                <button class="btn-del" data-id="${m.id}" data-nombre="${_escapeHtml(m.nombre)}">
                    ${_TRASH_ICON} Eliminar
                </button>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => eliminarMateria(btn.dataset.id, btn.dataset.nombre));
    });

    wrap.style.display = 'block';
}

const btnCrearMateria = document.getElementById('btnCrearMateria');
if (btnCrearMateria) {
    btnCrearMateria.addEventListener('click', async () => {
        const input  = document.getElementById('inputNombreMateria');
        const nombre = input.value.trim();
        _ocultarError('errorMateria');

        if (!nombre) {
            _mostrarError('errorMateriaMsg', 'errorMateria', 'Escribe el nombre de la materia.');
            return;
        }

        btnCrearMateria.disabled = true;

        const { ok, data } = await fetchAPI('/api/academics/materias/', {
            method: 'POST',
            body: JSON.stringify({ nombre }),
        });

        btnCrearMateria.disabled = false;

        if (!ok) {
            _mostrarError('errorMateriaMsg', 'errorMateria',
                data?.errores || data?.nombre?.[0] || 'Error al crear la materia.');
            return;
        }

        input.value = '';
        showToast(`Materia "${data.nombre}" agregada correctamente.`, 'success');
        await cargarMaterias();
    });
}

function eliminarMateria(id, nombre) {
    _abrirDelModal({
        step1Title:    '¿Eliminar materia?',
        step1Subtitle: 'Estás a punto de eliminar permanentemente esta materia del sistema.',
        nombre,
        confirmLabel:  'Eliminar materia',
        confirmBg:     '#ef4444',
        toastMsg:      `Materia "${nombre}" eliminada.`,
        warnings: [
            'Se eliminarán todas las asignaciones de esta materia con profesores y cursos.',
            'Esta acción no se puede deshacer.',
        ],
        action:    () => fetchAPI(`/api/academics/materias/${id}/`, { method: 'DELETE' }),
        onSuccess: cargarMaterias,
    });
}

// ════════════════════════════════════════════════════════════════
// VISTA PLANES DE TRABAJO
// ════════════════════════════════════════════════════════════════

(function _initPlanesMes() {
    const sel = document.getElementById('planesMesSel');
    // Preseleccionar mes actual
    sel.value = String(new Date().getMonth() + 1);
    sel.addEventListener('change', () => _cargarPlanes(sel.value));
})();

// Almacén de planes para el modal
let _planesData       = [];
let _planesStats      = { totalProfs: 0, incompletosProfs: 0 };
let _dirPlanAsigsByProf = {};   // profId → { nombre, pcs } — usado para stats de exportación

async function _cargarPlanes(mes) {
    const sel = document.getElementById('planesMesSel');
    if (!mes) mes = sel.value;
    const container = document.getElementById('planesContent');
    container.innerHTML = '<div class="spinner-inline"></div>';

    const [resPlanes, resAsigs] = await Promise.all([
        fetchAPI(`/api/academics/director/planes/?mes=${mes}`),
        fetchAPI('/api/academics/asignaciones/'),
    ]);

    if (!resPlanes.ok) {
        container.innerHTML = '<div class="empty-state">Error al cargar los planes.</div>';
        return;
    }

    _planesData = resPlanes.data || [];
    const asigs = resAsigs.data || [];

    if (!asigs.length) {
        container.innerHTML = '<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>Sin asignaciones registradas.</div>';
        return;
    }

    // Agrupar asignaciones por profesor → lista de ProfesorCursos
    const asigsByProf = {};
    for (const a of asigs) {
        if (!asigsByProf[a.profesor]) {
            asigsByProf[a.profesor] = { nombre: a.profesor_nombre, pcs: [] };
        }
        asigsByProf[a.profesor].pcs.push(a);
    }

    // Contar semanas planificadas por profesor_curso_id
    const semanasPorPc = {};  // pc_id → Set de semanas registradas
    for (const p of _planesData) {
        if (!semanasPorPc[p.profesor_curso_id]) semanasPorPc[p.profesor_curso_id] = new Set();
        semanasPorPc[p.profesor_curso_id].add(p.semana);
    }

    const sortedProfs = Object.entries(asigsByProf)
        .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre));

    // Guardar para el modal y exportación
    _dirPlanAsigsByProf = asigsByProf;
    _planesStats.totalProfs      = sortedProfs.length;
    _planesStats.incompletosProfs = sortedProfs.filter(([, prof]) =>
        prof.pcs.some(pc => (semanasPorPc[pc.id]?.size || 0) < 4)
    ).length;

    container.innerHTML = `<div class="prof-planes-grid">${
        sortedProfs.map(([profId, prof]) => {
            const pcs          = prof.pcs;
            const completedPcs = pcs.filter(pc => (semanasPorPc[pc.id]?.size || 0) === 4).length;
            const allComplete  = completedPcs === pcs.length;

            const dotsHtml = pcs.map(pc => {
                const count = semanasPorPc[pc.id]?.size || 0;
                const cls   = count === 4 ? 'prof-planes-dot--ok'
                            : count  > 0 ? 'prof-planes-dot--partial'
                            :              'prof-planes-dot--empty';
                return `<span class="prof-planes-dot ${cls}" title="${_escapeHtml(pc.materia_nombre)} — ${_escapeHtml(pc.curso_nombre)} (${count}/4 semanas)"></span>`;
            }).join('');

            const subTxt = allComplete
                ? 'Plan completo'
                : `${completedPcs}/${pcs.length} asignación${pcs.length !== 1 ? 'es' : ''} completa${completedPcs !== 1 ? 's' : ''}`;

            return `
                <div class="prof-planes-card${allComplete ? ' prof-planes-card--complete' : ''}" data-prof-id="${profId}">
                    <div class="prof-planes-top">
                        <div class="prof-planes-avatar">${_iniciales(prof.nombre)}</div>
                        <div>
                            <div class="prof-planes-name">${_escapeHtml(prof.nombre)}</div>
                            <div class="prof-planes-sub">${_escapeHtml(subTxt)}</div>
                        </div>
                    </div>
                    <div class="prof-planes-dots">${dotsHtml}</div>
                </div>`;
        }).join('')
    }</div>`;

    // Tarjetas clicables → ver planes (solo lectura)
    container.querySelectorAll('.prof-planes-card').forEach(card => {
        card.addEventListener('click', () => _abrirDirPlanModal(Number(card.dataset.profId)));
    });
}

// ════════════════════════════════════════════════════════════════
// MODAL VER PLANES POR PROFESOR (solo lectura)
// ════════════════════════════════════════════════════════════════

(function _initDirPlanModal() {
    const overlay = document.getElementById('dirPlanOverlay');
    const cerrar  = () => overlay.classList.remove('visible');
    document.getElementById('btnCerrarDirPlan').addEventListener('click', cerrar);
    document.getElementById('btnCerrarDirPlan2').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
})();

function _abrirDirPlanModal(profId) {
    const prof  = _dirPlanAsigsByProf[profId];
    const mes   = Number(document.getElementById('planesMesSel').value);
    const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    document.getElementById('dirPlanTitle').textContent = prof.nombre;
    document.getElementById('dirPlanSub').textContent   = `Planes de trabajo — ${meses[mes]}`;

    const planesProf = _planesData.filter(p => p.profesor_id === profId);
    const body       = document.getElementById('dirPlanBody');

    if (!planesProf.length) {
        body.innerHTML = `
            <div class="empty-state">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                </svg>
                Este profesor no registró ningún plan de trabajo para ${meses[mes]}.
            </div>`;
    } else {
        const porPc = {};
        for (const p of planesProf) {
            if (!porPc[p.profesor_curso_id]) {
                porPc[p.profesor_curso_id] = { materia: p.materia_nombre, curso: p.curso_nombre, semanas: {} };
            }
            porPc[p.profesor_curso_id].semanas[p.semana] = p.descripcion;
        }

        body.innerHTML = Object.values(porPc).map(pc => `
            <div class="dir-plan-section">
                <div class="dir-plan-section-head">${_escapeHtml(pc.materia)} — ${_escapeHtml(pc.curso)}</div>
                ${[1, 2, 3, 4].map(s => `
                    <div class="dir-plan-row">
                        <div class="dir-plan-week">Sem. ${s}</div>
                        ${pc.semanas[s]
                            ? `<div class="dir-plan-text">${_escapeHtml(pc.semanas[s])}</div>`
                            : `<div class="dir-plan-text--empty">Sin registrar</div>`
                        }
                    </div>`).join('')}
            </div>`).join('');
    }

    document.getElementById('dirPlanOverlay').classList.add('visible');
}

async function _ejecutarDescargaExcel() {
    const mes = document.getElementById('planesMesSel').value;
    const btn = document.getElementById('btnExportarPlanes');
    const SVG_DOWNLOAD = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Descargar Excel`;

    btn.disabled = true;
    btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .7s linear infinite">
            <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
        </svg>
        Generando…`;

    const token = localStorage.getItem('access_token');
    try {
        const res = await fetch(`/api/academics/director/planes/exportar/?mes=${mes}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.errores || 'Error al generar el archivo.');
        }
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const meses = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        a.href     = url;
        a.download = `planes_trabajo_${meses[mes]}_2026.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast(e.message || 'No se pudo descargar el archivo.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = SVG_DOWNLOAD;
    }
}

// ── Modal exportar mes global ──────────────────────────────────
const _modalExportMes   = document.getElementById('modalExportarPlanes');
const _exportMesSel     = document.getElementById('exportMesSel');
const _btnConfExport    = document.getElementById('btnConfirmarExportMes');

function _abrirModalExportMes() {
    _exportMesSel.value = String(new Date().getMonth() + 1);
    _modalExportMes.classList.add('visible');
}
function _cerrarModalExportMes() {
    _modalExportMes.classList.remove('visible');
}

document.getElementById('btnNavDescargarPlanes').addEventListener('click', _abrirModalExportMes);
document.getElementById('btnCerrarExportMes').addEventListener('click', _cerrarModalExportMes);
document.getElementById('btnCancelarExportMes').addEventListener('click', _cerrarModalExportMes);
_modalExportMes.addEventListener('click', e => { if (e.target === _modalExportMes) _cerrarModalExportMes(); });

_btnConfExport.addEventListener('click', async () => {
    const mes = Number(_exportMesSel.value);
    _btnConfExport.disabled = true;
    const meses = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const token = localStorage.getItem('access_token');
    try {
        const res = await fetch(`/api/academics/director/planes/exportar/?mes=${mes}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(data.errores || 'No hay planes para ese mes.', 'error');
            return;
        }
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `planes_trabajo_${meses[mes]}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
        _cerrarModalExportMes();
    } finally {
        _btnConfExport.disabled = false;
    }
});

document.getElementById('btnExportarPlanes').addEventListener('click', () => {
    // Sin datos en absoluto → bloquear
    if (_planesData.length === 0) {
        showToast('No hay planes registrados para este mes. No se puede generar el Excel.', 'error');
        return;
    }

    // Algunos profesores incompletos → pedir confirmación
    if (_planesStats.incompletosProfs > 0) {
        const { incompletosProfs, totalProfs } = _planesStats;
        const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const mes   = document.getElementById('planesMesSel').value;
        document.getElementById('exportWarnDesc').textContent =
            `${incompletosProfs} de ${totalProfs} profesor${totalProfs !== 1 ? 'es' : ''} aún no ` +
            `complet${incompletosProfs !== 1 ? 'aron' : 'ó'} su plan de trabajo para ${meses[mes]}. ` +
            `El archivo Excel solo contendrá los planes registrados hasta ahora.`;
        document.getElementById('exportWarnOverlay').classList.add('visible');
        return;
    }

    // Todo completo → descargar directo
    _ejecutarDescargaExcel();
});

(function _initExportWarnModal() {
    document.getElementById('btnExportWarnCancelar').addEventListener('click', () => {
        document.getElementById('exportWarnOverlay').classList.remove('visible');
    });
    document.getElementById('btnExportWarnConfirmar').addEventListener('click', () => {
        document.getElementById('exportWarnOverlay').classList.remove('visible');
        _ejecutarDescargaExcel();
    });
    document.getElementById('exportWarnOverlay').addEventListener('click', e => {
        if (e.target === document.getElementById('exportWarnOverlay'))
            document.getElementById('exportWarnOverlay').classList.remove('visible');
    });
})();

function _initPlanDetalleModal() {
    document.getElementById('btnCerrarPlanDetalle').addEventListener('click', () => {
        document.getElementById('modalPlanDetalle').classList.remove('visible');
    });
    document.getElementById('modalPlanDetalle').addEventListener('click', e => {
        if (e.target === document.getElementById('modalPlanDetalle'))
            document.getElementById('modalPlanDetalle').classList.remove('visible');
    });
}

function _abrirPlanDetalle(plan) {
    const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('planDetalleTitle').textContent = `${plan.profesor_nombre} — Semana ${plan.semana}`;
    document.getElementById('planDetalleSub').textContent   = `${meses[plan.mes] || ''} ${new Date().getFullYear()}`;
    document.getElementById('planDetalleBody').textContent  = plan.descripcion;
    document.getElementById('planDetalleDates').textContent = `${plan.fecha_inicio} al ${plan.fecha_fin}`;
    document.getElementById('modalPlanDetalle').classList.add('visible');
}

// ════════════════════════════════════════════════════════════════
// ASIGNACIONES — Selectores y creación
// ════════════════════════════════════════════════════════════════

async function cargarSelectores() {
    const [resUsuarios, resCursos, resMaterias] = await Promise.all([
        fetchAPI('/api/users/'),
        fetchAPI('/api/academics/cursos/'),
        fetchAPI('/api/academics/materias/'),
    ]);

    const profesores = (resUsuarios.data?.usuarios || []).filter(u => u.rol === 'Profesor');

    _poblarSelect('selProfesor', profesores, u =>
        ({ value: u.id, label: `${u.first_name} ${u.last_name}`.trim() || u.username })
    );
    _poblarSelect('selCurso', resCursos.data || [], c =>
        ({ value: c.id, label: `${c.grado} "${c.paralelo}"` })
    );
    _poblarSelect('selMateria', resMaterias.data || [], m =>
        ({ value: m.id, label: m.nombre })
    );
}

function _poblarSelect(id, items, mapFn) {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">— Selecciona —</option>';
    items.forEach(item => {
        const { value, label } = mapFn(item);
        const opt = document.createElement('option');
        opt.value       = value;
        opt.textContent = label;
        sel.appendChild(opt);
    });
}

document.getElementById('btnCrearAsignacion').addEventListener('click', () => {
    const selProfesor = document.getElementById('selProfesor');
    const selCurso    = document.getElementById('selCurso');
    const selMateria  = document.getElementById('selMateria');

    _ocultarError('errorAsignacion');

    if (!selProfesor.value || !selCurso.value || !selMateria.value) {
        _mostrarError('errorAsignacionMsg', 'errorAsignacion', 'Selecciona profesor, curso y materia.');
        return;
    }

    const profesorNom = selProfesor.options[selProfesor.selectedIndex].text;
    const cursoNom    = selCurso.options[selCurso.selectedIndex].text;
    const materiaNom  = selMateria.options[selMateria.selectedIndex].text;

    _abrirDelModal({
        step1Title:    'Crear asignación',
        step1Subtitle: 'Confirma los datos antes de registrar la asignación.',
        nombre:        `${materiaNom} — ${cursoNom}`,
        confirmLabel:  'Crear asignación',
        confirmBg:     'var(--accent)',
        toastMsg:      `Asignación creada: ${profesorNom} en ${materiaNom} (${cursoNom}).`,
        warnings: [
            `${profesorNom} será asignado a ${materiaNom} en ${cursoNom}.`,
            'Podrás modificar o eliminar esta asignación después.',
        ],
        action: () => fetchAPI('/api/academics/asignaciones/', {
            method: 'POST',
            body: JSON.stringify({
                profesor: parseInt(selProfesor.value),
                curso:    parseInt(selCurso.value),
                materia:  parseInt(selMateria.value),
            }),
        }),
        onSuccess: async () => {
            document.getElementById('modalNuevaAsig').classList.remove('visible');
            selProfesor.value = '';
            selCurso.value    = '';
            selMateria.value  = '';
            // Refrescar la vista activa
            if (_pivotActivo === 'profesores') await _cargarVistaProfesor();
            else if (_pivotActivo === 'cursos') {
                await _cargarVistaCursos();
                if (_vcPanelCursoId !== null) {
                    const card = document.querySelector(`.curso-card[data-curso-id="${_vcPanelCursoId}"]`);
                    if (card) card.click();
                }
            }
        },
    });
});

function eliminarAsignacion(id, profesor, curso, materia, onSuccess) {
    _abrirDelModal({
        step1Title:    '¿Eliminar asignación?',
        step1Subtitle: 'Se eliminará la relación entre el profesor, el curso y la materia.',
        nombre:        `${materia} — ${curso}`,
        confirmLabel:  'Eliminar asignación',
        confirmBg:     '#ef4444',
        toastMsg:      `Asignación de "${materia}" en ${curso} eliminada.`,
        warnings: [
            `${profesor} dejará de estar asignado a ${materia} en ${curso}.`,
            'Esta acción no se puede deshacer.',
        ],
        action:    () => fetchAPI(`/api/academics/asignaciones/${id}/`, { method: 'DELETE' }),
        onSuccess: onSuccess || _cargarVistaProfesor,
    });
}

// ════════════════════════════════════════════════════════════════
// MODAL DE CONFIRMACIÓN (2 pasos + contraseña)
// ════════════════════════════════════════════════════════════════

let _delConfig = null;

const delBackdrop         = document.getElementById('delBackdrop');
const delStep1            = document.getElementById('delStep1');
const delStep2            = document.getElementById('delStep2');
const delMateriaNombre    = document.getElementById('delMateriaNombre');
const delMateriaNombre2   = document.getElementById('delMateriaNombre2');
const delWarnList         = document.getElementById('delWarnList');
const delStep2Subtitle    = document.getElementById('delStep2Subtitle');
const delCancel1          = document.getElementById('delCancel1');
const delContinuar        = document.getElementById('delContinuar');
const delCancel2          = document.getElementById('delCancel2');
const delConfirmar        = document.getElementById('delConfirmar');
const delConfirmarText    = document.getElementById('delConfirmarText');
const delConfirmarSpinner = document.getElementById('delConfirmarSpinner');
const delPassInput        = document.getElementById('delPassInput');
const delPassError        = document.getElementById('delPassError');
const delPassToggle       = document.getElementById('delPassToggle');
const delEyeIcon          = document.getElementById('delEyeIcon');

function _abrirDelModal(config) {
    _delConfig = config;
    document.getElementById('delStep1Title').textContent    = config.step1Title    || '¿Confirmar acción?';
    document.getElementById('delStep1Subtitle').textContent = config.step1Subtitle || 'Revisa los detalles antes de continuar.';
    delMateriaNombre.textContent  = config.nombre;
    delMateriaNombre2.textContent = config.nombre;
    delStep2Subtitle.innerHTML    = `Ingresa tu contraseña para autorizar esta acción sobre <strong>${_escapeHtml(config.nombre)}</strong>.`;
    delConfirmarText.textContent  = config.confirmLabel || 'Confirmar';
    delConfirmar.style.background = config.confirmBg    || '#ef4444';
    delWarnList.innerHTML = (config.warnings || []).map(w =>
        `<div class="del-warn-item">${_WARN_SVG}${_escapeHtml(w)}</div>`
    ).join('');
    delPassInput.value = '';
    delPassError.textContent = '';
    delPassInput.classList.remove('input-error');
    delPassInput.type = 'password';
    delEyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    delStep1.classList.add('active');
    delStep2.classList.remove('active');
    delBackdrop.classList.add('visible');
}

function _cerrarDelModal() {
    delBackdrop.classList.remove('visible');
    _delConfig = null;
}

delCancel1.addEventListener('click', _cerrarDelModal);
delCancel2.addEventListener('click', _cerrarDelModal);
delBackdrop.addEventListener('click', e => { if (e.target === delBackdrop) _cerrarDelModal(); });

delContinuar.addEventListener('click', () => {
    delStep1.classList.remove('active');
    delStep2.classList.add('active');
    setTimeout(() => delPassInput.focus(), 50);
});

delPassToggle.addEventListener('click', () => {
    const oculto = delPassInput.type === 'password';
    delPassInput.type = oculto ? 'text' : 'password';
    delEyeIcon.innerHTML = oculto
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
});

delPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') delConfirmar.click(); });

delConfirmar.addEventListener('click', async () => {
    const password = delPassInput.value;
    if (!password) {
        delPassError.textContent = 'Ingresa tu contraseña.';
        delPassInput.classList.add('input-error');
        return;
    }

    delPassInput.classList.remove('input-error');
    delPassError.textContent = '';
    delConfirmar.disabled = true;
    delConfirmarText.style.display  = 'none';
    delConfirmarSpinner.style.display = 'block';

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const { ok: loginOk } = await fetchAPI('/api/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username: user?.username, password }),
    });

    if (!loginOk) {
        delConfirmar.disabled = false;
        delConfirmarText.style.display    = '';
        delConfirmarSpinner.style.display = 'none';
        delPassError.textContent = 'Contraseña incorrecta. Intenta de nuevo.';
        delPassInput.classList.add('input-error');
        delPassInput.focus();
        return;
    }

    const { ok, data } = await _delConfig.action();

    delConfirmar.disabled = false;
    delConfirmarText.style.display    = '';
    delConfirmarSpinner.style.display = 'none';

    if (!ok) {
        delPassError.textContent = data?.errores || 'No se pudo completar la acción.';
        return;
    }

    const onSuccess = _delConfig.onSuccess;
    const toastMsg  = _delConfig.toastMsg || `"${_delConfig.nombre}" actualizado.`;
    _cerrarDelModal();
    showToast(toastMsg, 'success');
    await onSuccess();
});
