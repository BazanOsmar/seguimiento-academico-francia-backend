'use strict';

/* ================================================================
   academico.js — Gestión Académica (Director)
   Pivots: Por Profesor | Por Curso | Materias | Planes de Trabajo
   ================================================================ */

// ── Estado global ─────────────────────────────────────────────────
let _vpAsignaciones = [];
let _vpProfesores   = [];
let _vpProfSelId    = null;
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

    const [resAsig, resUsers] = await Promise.all([
        fetchAPI('/api/academics/asignaciones/'),
        fetchAPI('/api/users/'),
    ]);

    _vpAsignaciones = resAsig.data || [];
    _vpProfesores   = (resUsers.data?.usuarios || []).filter(u => u.rol === 'Profesor');

    const porProf = {};
    for (const a of _vpAsignaciones) {
        if (!porProf[a.profesor]) {
            porProf[a.profesor] = { id: a.profesor, nombre: a.profesor_nombre, asigs: [] };
        }
        porProf[a.profesor].asigs.push(a);
    }

    const grupos = Object.values(porProf).sort((a, b) => a.nombre.localeCompare(b.nombre));
    _renderVpSidebar(grupos);
}

function _renderVpSidebar(grupos) {
    const vpProfList = document.getElementById('vpProfList');

    if (!grupos.length) {
        vpProfList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:.85rem;">Sin asignaciones registradas.</div>';
        return;
    }

    vpProfList.innerHTML = grupos.map(g => `
        <div class="vp-prof-item" data-prof-id="${g.id}">
            <div class="vp-prof-avatar">${_iniciales(g.nombre)}</div>
            <div class="vp-prof-info">
                <div class="vp-prof-name">${g.nombre}</div>
            </div>
            <span class="vp-prof-badge">${g.asigs.length}</span>
        </div>
    `).join('');

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
    vpContent.innerHTML = `
        <div class="vp-content-header">
            <div class="vp-content-title">${grupo.nombre}</div>
            <span class="vp-content-sub">${grupo.asigs.length} asignación${grupo.asigs.length !== 1 ? 'es' : ''}</span>
        </div>
        <div class="vp-cards-grid" id="vpCardsGrid"></div>`;

    const grid = document.getElementById('vpCardsGrid');
    grid.innerHTML = grupo.asigs.map(a => _asigCardHtml(a)).join('');

    grid.querySelectorAll('.asig-card').forEach(card => {
        const id   = Number(card.dataset.id);
        const asig = grupo.asigs.find(a => a.id === id);

        card.querySelector('.asig-btn-del').addEventListener('click', () => {
            eliminarAsignacion(asig.id, asig.profesor_nombre, asig.curso_nombre, asig.materia_nombre, async () => {
                await _cargarVistaProfesor();
            });
        });

        card.querySelector('.asig-btn-edit').addEventListener('click', () => {
            _activarModoEdicion(card, asig, grupo);
        });
    });
}

function _asigCardHtml(a) {
    return `
        <div class="asig-card" data-id="${a.id}">
            <div class="asig-card__materia">${a.materia_nombre}</div>
            <div class="asig-card__curso">${a.curso_nombre}</div>
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
// VISTA POR CURSO (ACORDEÓN)
// ════════════════════════════════════════════════════════════════

async function _cargarVistaCursos() {
    const container = document.getElementById('cursosAcordeon');
    container.innerHTML = '<div class="spinner-inline"></div>';

    const [resCursos, resAsig] = await Promise.all([
        fetchAPI('/api/academics/cursos/'),
        fetchAPI('/api/academics/asignaciones/'),
    ]);

    const cursos = resCursos.data || [];
    _vcAsigs     = resAsig.data  || [];

    if (!cursos.length) {
        container.innerHTML = '<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>Sin cursos registrados</div>';
        return;
    }

    container.innerHTML = `<div class="curso-cards-grid">${cursos.map(c => {
        const count       = _vcAsigs.filter(a => a.curso === c.id).length;
        const cursoNombre = `${c.grado} "${c.paralelo}"`;
        const warnCls     = count === 0 ? ' curso-card__count--warn' : '';
        const countTxt    = count === 0 ? '⚠ Sin asignaciones' : `${count} asignación${count !== 1 ? 'es' : ''}`;
        return `
            <div class="curso-card" data-curso-id="${c.id}" data-curso-nombre="${_escapeHtml(cursoNombre)}">
                <div class="curso-card__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                    </svg>
                </div>
                <div class="curso-card__name">${_escapeHtml(cursoNombre)}</div>
                <div class="curso-card__count${warnCls}">${countTxt}</div>
            </div>`;
    }).join('')}</div>`;

    container.querySelectorAll('.curso-card').forEach(card => {
        card.addEventListener('click', () => {
            container.querySelectorAll('.curso-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            _abrirVcDrawer(parseInt(card.dataset.cursoId), card.dataset.cursoNombre);
        });
    });
}

// ════════════════════════════════════════════════════════════════
// DRAWER — Detalle de Curso
// ════════════════════════════════════════════════════════════════

function _abrirVcDrawer(cursoId, nombre) {
    _vcPanelCursoId = cursoId;
    document.getElementById('vcDrawerTitle').textContent = nombre;
    _renderVcDrawerBody(cursoId, nombre);
    document.getElementById('vcDrawerBackdrop').classList.add('visible');
}

function _cerrarVcDrawer() {
    document.getElementById('vcDrawerBackdrop').classList.remove('visible');
    document.querySelectorAll('.curso-card').forEach(c => c.classList.remove('active'));
    _vcPanelCursoId = null;
}

function _renderVcDrawerBody(cursoId, nombre) {
    const body  = document.getElementById('vcDrawerBody');
    const asigs = _vcAsigs.filter(a => a.curso === cursoId);

    if (!asigs.length) {
        body.innerHTML = `<div class="empty-state"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>Sin asignaciones</div>`;
        return;
    }

    body.innerHTML = `
        <div class="vc-drawer-count">${asigs.length} asignación${asigs.length !== 1 ? 'es' : ''}</div>
        ${asigs.map(a => `
            <div class="vc-asig-row">
                <div class="vc-asig-info">
                    <div class="vc-asig-materia">${_escapeHtml(a.materia_nombre)}</div>
                    <div class="vc-asig-profesor">${_escapeHtml(a.profesor_nombre)}</div>
                </div>
                <button class="btn-del" data-asig-id="${a.id}" data-profesor="${_escapeHtml(a.profesor_nombre)}" data-curso="${_escapeHtml(nombre)}" data-materia="${_escapeHtml(a.materia_nombre)}">
                    ${_TRASH_ICON}
                </button>
            </div>
        `).join('')}
    `;

    body.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => {
            eliminarAsignacion(
                btn.dataset.asigId,
                btn.dataset.profesor,
                btn.dataset.curso,
                btn.dataset.materia,
                async () => {
                    await _cargarVistaCursos();
                    if (_vcPanelCursoId !== null) {
                        const card = document.querySelector(`.curso-card[data-curso-id="${_vcPanelCursoId}"]`);
                        if (card) card.click();
                        else _cerrarVcDrawer();
                    }
                },
            );
        });
    });
}

document.getElementById('vcDrawerClose').addEventListener('click', _cerrarVcDrawer);
document.getElementById('vcDrawerBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('vcDrawerBackdrop')) _cerrarVcDrawer();
});

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

document.getElementById('btnCrearMateria').addEventListener('click', async () => {
    const input  = document.getElementById('inputNombreMateria');
    const nombre = input.value.trim();
    _ocultarError('errorMateria');

    if (!nombre) {
        _mostrarError('errorMateriaMsg', 'errorMateria', 'Escribe el nombre de la materia.');
        return;
    }

    const btn    = document.getElementById('btnCrearMateria');
    btn.disabled = true;

    const { ok, data } = await fetchAPI('/api/academics/materias/', {
        method: 'POST',
        body: JSON.stringify({ nombre }),
    });

    btn.disabled = false;

    if (!ok) {
        _mostrarError('errorMateriaMsg', 'errorMateria',
            data?.errores || data?.nombre?.[0] || 'Error al crear la materia.');
        return;
    }

    input.value = '';
    showToast(`Materia "${data.nombre}" agregada correctamente.`, 'success');
    await cargarMaterias();
});

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
