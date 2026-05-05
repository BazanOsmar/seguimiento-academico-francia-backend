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
let _vpSeguimientoMes = null;
let _vpUsuariosFiltro = 'activos';
let _vpProfesoresRender = [];
let _vpProfesorDetalleId = null;
let _vpCursosCache = null;
let _vpMateriasCache = null;

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
    _initProfesorDetalleModal();
    // Cargar vista por defecto
    _cargarVistaProfesor();
    cargarMaterias({ notifyError: false }); // precarga silenciosa
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
    document.getElementById('profileName').textContent = "Republica de Francia 'A'";
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
        case 'notas':
            document.getElementById('vistaNotas').classList.add('active');
            _pnActivar();
            break;
    }
}

// ════════════════════════════════════════════════════════════════
// MODAL NUEVA ASIGNACIÓN
// ════════════════════════════════════════════════════════════════

function _initModalNuevaAsig() {
    const modal = document.getElementById('modalNuevaAsig');
    const btnNuevaAsig = document.getElementById('btnNuevaAsig');
    if (!modal || !btnNuevaAsig) return;

    btnNuevaAsig.addEventListener('click', async () => {
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
    const tableWrap = document.getElementById('vpSeguimientoTable');
    if (!tableWrap) return;

    _initVpSeguimientoMes();
    _initVpFiltroUsuarios();
    const mes = _vpSeguimientoMes || (new Date().getMonth() + 1);

    tableWrap.innerHTML = '<div class="vp-follow-loading"><div class="spinner-inline"></div></div>';

    const res = await fetchAPI(`/api/academics/director/seguimiento-profesores/?mes=${mes}`);
    if (!res.ok) {
        _actualizarContadorProfesores(0);
        tableWrap.innerHTML = `
            <div class="empty-state vp-follow-empty">
                ${_WARN_SVG}
                No se pudo cargar el seguimiento de profesores.
            </div>`;
        return;
    }

    const profesoresActivos = (res.data?.profesores || []).map(p => ({ ...p, is_active: p.is_active !== false }));
    _actualizarContadorProfesores(profesoresActivos.length);

    let profesores = profesoresActivos;
    if (_vpUsuariosFiltro === 'inactivos') {
        profesores = await _cargarProfesoresInactivos();
    }

    _vpProfesoresRender = profesores;
    _initVpBuscadorProfesores();
    profesores = _filtrarProfesoresVista(profesores);

    if (!profesores.length) {
        const emptyText = _vpUsuariosFiltro === 'inactivos'
            ? 'Sin profesores inactivos registrados.'
            : 'Sin profesores con cursos asignados.';
        tableWrap.innerHTML = `
            <div class="empty-state vp-follow-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                </svg>
                ${emptyText}
            </div>`;
        return;
    }

    tableWrap.innerHTML = `
        <table class="vp-follow-table">
            <thead>
                <tr>
                    <th>Profesor</th>
                    <th>Cursos asignados</th>
                    <th>Planes de trabajo</th>
                    <th>Calificaciones cargadas</th>
                    <th aria-label="Acciones"></th>
                </tr>
            </thead>
            <tbody>
                ${profesores.map(_vpSeguimientoRowHtml).join('')}
            </tbody>
        </table>`;

    tableWrap.querySelectorAll('.vp-follow-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            _desactivarProfesor(btn.dataset.profId, btn.dataset.profName);
        });
    });
    tableWrap.querySelectorAll('.vp-follow-activate').forEach(btn => {
        btn.addEventListener('click', () => {
            _activarProfesor(btn.dataset.profId, btn.dataset.profName);
        });
    });
    _initVpProfesorRows(tableWrap);
}

function _actualizarContadorProfesores(total) {
    const el = document.getElementById('vpProfesoresCount');
    if (el) el.textContent = String(total);
}

function _initVpFiltroUsuarios() {
    document.querySelectorAll('[data-vp-users-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.vpUsersFilter === _vpUsuariosFiltro);
        btn.onclick = () => {
            _vpUsuariosFiltro = btn.dataset.vpUsersFilter;
            _initVpFiltroUsuarios();
            _cargarVistaProfesor();
        };
    });
}

async function _cargarProfesoresInactivos() {
    const [usersRes, asigsRes] = await Promise.all([
        fetchAPI('/api/users/'),
        fetchAPI('/api/academics/asignaciones/'),
    ]);
    const usuarios = usersRes.data?.usuarios || [];
    const asigs = asigsRes.data || [];
    return usuarios
        .filter(u => u.rol === 'Profesor' && u.is_active === false)
        .map(u => ({
            id: u.id,
            nombre: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
            username: u.username,
            cursos_asignados: asigs.filter(a => a.profesor === u.id).length,
            notas_cargadas: null,
            planes_completos: null,
            is_active: false,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function _initVpBuscadorProfesores() {
    const search = document.getElementById('vpBuscarProfesor');
    if (!search || search.dataset.ready === '1') return;
    search.dataset.ready = '1';
    search.addEventListener('input', () => _renderVpProfesoresFiltrados());
}

function _filtrarProfesoresVista(profesores) {
    const q = (document.getElementById('vpBuscarProfesor')?.value || '').trim().toLowerCase();
    if (!q) return profesores;
    return profesores.filter(p =>
        String(p.nombre || '').toLowerCase().includes(q) ||
        String(p.username || '').toLowerCase().includes(q)
    );
}

function _renderVpProfesoresFiltrados() {
    const tableWrap = document.getElementById('vpSeguimientoTable');
    if (!tableWrap) return;
    const profesores = _filtrarProfesoresVista(_vpProfesoresRender);

    if (!profesores.length) {
        tableWrap.innerHTML = `
            <div class="empty-state vp-follow-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                </svg>
                No se encontraron profesores con ese criterio.
            </div>`;
        return;
    }

    tableWrap.innerHTML = `
        <table class="vp-follow-table">
            <thead>
                <tr>
                    <th>Profesor</th>
                    <th>Cursos asignados</th>
                    <th>Planes de trabajo</th>
                    <th>Calificaciones cargadas</th>
                    <th aria-label="Acciones"></th>
                </tr>
            </thead>
            <tbody>${profesores.map(_vpSeguimientoRowHtml).join('')}</tbody>
        </table>`;

    tableWrap.querySelectorAll('.vp-follow-delete').forEach(btn => {
        btn.addEventListener('click', () => _desactivarProfesor(btn.dataset.profId, btn.dataset.profName));
    });
    tableWrap.querySelectorAll('.vp-follow-activate').forEach(btn => {
        btn.addEventListener('click', () => _activarProfesor(btn.dataset.profId, btn.dataset.profName));
    });
    _initVpProfesorRows(tableWrap);
}

function _initVpProfesorRows(scope) {
    scope.querySelectorAll('.vp-follow-row').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            _abrirProfesorDetalle(row.dataset.profId);
        });
    });
}

function _initVpSeguimientoMes() {
    const label = document.getElementById('vpMesLabel');
    const prev  = document.getElementById('vpMesPrev');
    const next  = document.getElementById('vpMesNext');
    if (!label || !prev || !next) return;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    if (!_vpSeguimientoMes) _vpSeguimientoMes = currentMonth;

    const date = new Date(now.getFullYear(), _vpSeguimientoMes - 1, 1);
    label.textContent = date.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });

    prev.disabled = _vpSeguimientoMes <= 1;
    next.disabled = _vpSeguimientoMes >= currentMonth;

    prev.onclick = () => {
        if (_vpSeguimientoMes <= 1) return;
        _vpSeguimientoMes -= 1;
        _cargarVistaProfesor();
    };
    next.onclick = () => {
        if (_vpSeguimientoMes >= currentMonth) return;
        _vpSeguimientoMes += 1;
        _cargarVistaProfesor();
    };
}

function _vpSeguimientoRowHtml(prof) {
    const total = Number(prof.cursos_asignados) || 0;
    const isActive = prof.is_active !== false;
    return `
        <tr class="vp-follow-row" data-prof-id="${prof.id}">
            <td>
                <div class="vp-follow-prof">
                    <div class="vp-follow-avatar">${_iniciales(prof.nombre || prof.username || '')}</div>
                    <div class="vp-follow-prof-copy">
                        <span class="vp-follow-name">${_escapeHtml(prof.nombre || prof.username || 'Profesor')}</span>
                        <span class="vp-follow-user">${_escapeHtml(prof.username || '')}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="vp-follow-courses">${total}</span>
            </td>
            <td>${isActive ? _vpSeguimientoBadge(prof.planes_completos, total) : _vpInactiveBadge()}</td>
            <td>${isActive ? _vpSeguimientoBadge(prof.notas_cargadas, total) : _vpInactiveBadge()}</td>
            <td>
                ${isActive ? `
                    <button class="vp-follow-delete" type="button"
                        data-prof-id="${prof.id}"
                        data-prof-name="${_escapeHtml(prof.nombre || prof.username || 'Profesor')}"
                        aria-label="Desactivar profesor ${_escapeHtml(prof.nombre || prof.username || '')}">
                        ${_TRASH_ICON}
                    </button>` : `
                    <button class="vp-follow-activate" type="button"
                        data-prof-id="${prof.id}"
                        data-prof-name="${_escapeHtml(prof.nombre || prof.username || 'Profesor')}"
                        aria-label="Activar profesor ${_escapeHtml(prof.nombre || prof.username || '')}">
                        Activar nuevamente
                    </button>`}
            </td>
        </tr>`;
}

function _vpSeguimientoBadge(valor, total) {
    const actual = Number(valor) || 0;
    const max    = Number(total) || 0;
    const status = actual === 0 ? 'red' : (actual >= max ? 'green' : 'orange');
    return `
        <span class="vp-follow-score vp-follow-score--${status}" title="${actual}/${max}">
            <span class="vp-follow-score-dot"></span>
            ${actual}/${max}
        </span>`;
}

function _vpInactiveBadge() {
    return '<span class="vp-follow-score vp-follow-score--muted">Inactivo</span>';
}

async function _abrirProfesorDetalle(profesorId) {
    _vpProfesorDetalleId = profesorId;
    const overlay = document.getElementById('vpProfesorModal');
    const body = document.getElementById('vpProfesorModalBody');
    if (!overlay || !body) return;

    overlay.classList.add('visible');
    body.innerHTML = '<div class="vp-prof-detail-loading"><div class="spinner-inline"></div></div>';

    const { ok, data } = await fetchAPI(`/api/academics/director/profesores/${profesorId}/asignaciones/`);
    if (!ok) {
        body.innerHTML = `<div class="empty-state vp-prof-detail-empty">${_WARN_SVG}No se pudo cargar el detalle del profesor.</div>`;
        return;
    }

    _renderProfesorDetalle(data);
}

function _cerrarProfesorDetalle() {
    document.getElementById('vpProfesorModal')?.classList.remove('visible');
    _vpProfesorDetalleId = null;
}

function _initProfesorDetalleModal() {
    const overlay = document.getElementById('vpProfesorModal');
    const close = document.getElementById('vpProfesorModalClose');
    if (!overlay || !close) return;
    close.addEventListener('click', _cerrarProfesorDetalle);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) _cerrarProfesorDetalle();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('visible')) _cerrarProfesorDetalle();
    });
}

function _renderProfesorDetalle(data) {
    const body = document.getElementById('vpProfesorModalBody');
    const asignaciones = data.asignaciones || [];
    const rows = asignaciones.length
        ? asignaciones.map(a => `
            <div class="vp-prof-asig-row">
                <div class="vp-prof-asig-main">
                    <span class="vp-prof-asig-course">${_escapeHtml(a.curso_nombre)}</span>
                    <span class="vp-prof-asig-sub">${_escapeHtml(a.materia_nombre)}</span>
                </div>
                <button class="vp-prof-asig-del" type="button"
                    data-asig-id="${a.id}"
                    data-course="${_escapeHtml(a.curso_nombre)}"
                    data-subject="${_escapeHtml(a.materia_nombre)}"
                    aria-label="Eliminar asignación ${_escapeHtml(a.curso_nombre)} ${_escapeHtml(a.materia_nombre)}">
                    ${_TRASH_ICON}
                </button>
            </div>`).join('')
        : `<div class="empty-state vp-prof-detail-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
                Sin cursos asignados.
            </div>`;

    body.innerHTML = `
        <div class="vp-prof-detail-head">
            <div class="vp-prof-detail-avatar">${_iniciales(data.nombre || data.username || '')}</div>
            <div class="vp-prof-detail-copy">
                <h3 id="vpProfesorModalTitle">${_escapeHtml(data.nombre || data.username || 'Profesor')}</h3>
                <p>${_escapeHtml(data.username || '')}</p>
            </div>
        </div>
        <div class="vp-prof-detail-summary">
            <span>${asignaciones.length} asignación${asignaciones.length !== 1 ? 'es' : ''}</span>
            <span>${data.is_active ? 'Activo' : 'Inactivo'}</span>
        </div>
        <div class="vp-prof-detail-section">
            <div class="vp-prof-detail-section-title">Cursos y materias</div>
            <div class="vp-prof-asig-list">${rows}</div>
        </div>
        <div class="vp-prof-add-panel">
            <button class="vp-prof-add-toggle" id="vpProfAddToggle" type="button">
                <span>+</span> Añadir curso y materia
            </button>
            <div class="vp-prof-add-form" id="vpProfAddForm">
                <select id="vpProfCursoSel" aria-label="Curso"></select>
                <select id="vpProfMateriaSel" aria-label="Materia"></select>
                <button class="btn-primary" id="vpProfAddSave" type="button">Agregar</button>
            </div>
            <p class="vp-prof-add-error" id="vpProfAddError"></p>
        </div>`;

    body.querySelectorAll('.vp-prof-asig-del').forEach(btn => {
        btn.addEventListener('click', () => _eliminarAsignacionProfesor(
            btn.dataset.asigId,
            btn.dataset.course,
            btn.dataset.subject,
        ));
    });

    document.getElementById('vpProfAddToggle').addEventListener('click', async () => {
        const form = document.getElementById('vpProfAddForm');
        form.classList.toggle('visible');
        if (form.classList.contains('visible')) await _cargarSelectoresProfesorDetalle();
    });
    document.getElementById('vpProfAddSave').addEventListener('click', () => _crearAsignacionProfesorDetalle(data.id));
}

async function _cargarSelectoresProfesorDetalle() {
    const cursoSel = document.getElementById('vpProfCursoSel');
    const materiaSel = document.getElementById('vpProfMateriaSel');
    if (!cursoSel || !materiaSel) return;

    if (!_vpCursosCache || !_vpMateriasCache) {
        const [cursosRes, materiasRes] = await Promise.all([
            fetchAPI('/api/academics/cursos/'),
            fetchAPI('/api/academics/materias/'),
        ]);
        _vpCursosCache = cursosRes.data || [];
        _vpMateriasCache = materiasRes.data || [];
    }

    cursoSel.innerHTML = '<option value="">Selecciona curso</option>' + _vpCursosCache
        .map(c => `<option value="${c.id}">${_escapeHtml(`${c.grado} "${c.paralelo}"`)}</option>`)
        .join('');
    materiaSel.innerHTML = '<option value="">Selecciona materia</option>' + _vpMateriasCache
        .map(m => `<option value="${m.id}">${_escapeHtml(m.nombre)}</option>`)
        .join('');
}

async function _crearAsignacionProfesorDetalle(profesorId) {
    const curso = document.getElementById('vpProfCursoSel')?.value;
    const materia = document.getElementById('vpProfMateriaSel')?.value;
    const error = document.getElementById('vpProfAddError');
    if (!curso || !materia) {
        if (error) error.textContent = 'Selecciona curso y materia.';
        return;
    }
    if (error) error.textContent = '';

    const btn = document.getElementById('vpProfAddSave');
    btn.disabled = true;
    const { ok, data } = await fetchAPI('/api/academics/asignaciones/', {
        method: 'POST',
        body: JSON.stringify({
            profesor: Number(profesorId),
            curso: Number(curso),
            materia: Number(materia),
        }),
    });
    btn.disabled = false;

    if (!ok) {
        if (error) error.textContent = _mensajeErrorServidor(data, 'No se pudo crear la asignación.');
        return;
    }

    _mostrarResultadoAccion('success', 'Asignación creada', 'La asignación fue registrada correctamente.');
    await _abrirProfesorDetalle(profesorId);
    await _cargarVistaProfesor();
}

function _eliminarAsignacionProfesor(asigId, curso, materia) {
    _abrirDelModal({
        step1Title: '¿Eliminar asignación?',
        step1Subtitle: 'Se eliminará la relación entre el profesor, el curso y la materia.',
        nombre: `${materia} — ${curso}`,
        confirmLabel: 'Eliminar asignación',
        confirmBg: '#ef4444',
        toastMsg: `Asignación de "${materia}" en ${curso} eliminada.`,
        warnings: [
            'Esta acción no elimina al profesor, curso ni materia.',
            'Solo se borra esta asignación académica.',
        ],
        action: password => _eliminarAsignacionProfesorRequest(asigId, password),
        onSuccess: async () => {
            if (_vpProfesorDetalleId) await _abrirProfesorDetalle(_vpProfesorDetalleId);
            await _cargarVistaProfesor();
        },
        successTitle: 'Asignación eliminada',
        skipPreAuth: true,
    });
}

async function _eliminarAsignacionProfesorRequest(asigId, password) {
    const token = localStorage.getItem('access_token');
    try {
        const res = await fetch(`/api/academics/asignaciones/${asigId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ password_director: password }),
        });
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : null;
        return { ok: res.ok, status: res.status, data };
    } catch (_) {
        return {
            ok: false,
            status: 0,
            data: { errores: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.' },
        };
    }
}

function _desactivarProfesor(id, nombre) {
    _abrirDelModal({
        step1Title:    '¿Desactivar profesor?',
        step1Subtitle: 'El profesor dejará de aparecer como usuario activo del sistema.',
        nombre,
        confirmLabel:  'Desactivar profesor',
        confirmBg:     '#ef4444',
        toastMsg:      `${nombre} fue desactivado correctamente.`,
        warnings: [
            `${nombre} no podrá ingresar al sistema mientras esté desactivado.`,
            'Esta acción requiere tu contraseña de director.',
        ],
        action: password => _desactivarProfesorRequest(id, password),
        onSuccess: _cargarVistaProfesor,
        successTitle: 'Profesor desactivado',
        skipPreAuth: true,
    });
}

function _activarProfesor(id, nombre) {
    _abrirDelModal({
        step1Title:    '¿Activar profesor?',
        step1Subtitle: 'El profesor volverá a aparecer como usuario activo del sistema.',
        nombre,
        confirmLabel:  'Activar profesor',
        confirmBg:     '#16a34a',
        toastMsg:      `${nombre} fue activado correctamente.`,
        warnings: [
            `${nombre} podrá ingresar nuevamente al sistema.`,
            'Esta acción requiere tu contraseña de director.',
        ],
        action: password => _activarProfesorRequest(id, password),
        onSuccess: _cargarVistaProfesor,
        successTitle: 'Profesor activado',
        skipPreAuth: true,
    });
}

async function _desactivarProfesorRequest(id, password) {
    const token = localStorage.getItem('access_token');
    try {
        const res = await fetch(`/api/users/profesores/${id}/desactivar/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ contrasena: password }),
        });
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : null;
        return { ok: res.ok, status: res.status, data };
    } catch (_) {
        return {
            ok: false,
            status: 0,
            data: { errores: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.' },
        };
    }
}

async function _activarProfesorRequest(id, password) {
    const token = localStorage.getItem('access_token');
    try {
        const res = await fetch(`/api/users/profesores/${id}/activar/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ contrasena: password }),
        });
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : null;
        return { ok: res.ok, status: res.status, data };
    } catch (_) {
        return {
            ok: false,
            status: 0,
            data: { errores: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.' },
        };
    }
}

function _mensajeErrorServidor(data, fallback = 'No se pudo completar la acción.') {
    if (!data) return fallback;
    if (typeof data.errores === 'string') return data.errores;
    if (typeof data.detail === 'string') return data.detail;
    const values = Object.values(data).flat().filter(Boolean);
    return values.length ? values.join(' ') : fallback;
}

function _mostrarResultadoAccion(type, title, message) {
    if (typeof showAppToast === 'function') {
        showAppToast(type, title, message);
    } else if (typeof _apiToast === 'function') {
        _apiToast(message, type);
    } else if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        alert(message);
    }
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
            action: async password => {
                const r1 = await _eliminarAsignacionProfesorRequest(asig.id, password);
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
            skipPreAuth: true,
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
        const valCls    = nMaterias === 0 ? ' vc-card-stat-val--warn' : '';
        return `
            <article class="vc-course-card${isActive ? ' active' : ''}" data-curso-id="${c.id}" data-has-materias="${nMaterias ? '1' : '0'}">
                <div class="vc-card-name">${_escapeHtml(nombre)}</div>
                <div class="vc-card-stats">
                    <div class="vc-card-stat-box">
                        <span class="vc-card-stat-label">Estudiantes</span>
                        <span class="vc-card-stat-val">${c.estudiantes_count ?? '—'}</span>
                    </div>
                    <div class="vc-card-stat-box">
                        <span class="vc-card-stat-label">Materias</span>
                        <span class="vc-card-stat-val${valCls}">${nMaterias}</span>
                    </div>
                </div>
            </article>`;
    }).join('');

    grid.innerHTML = `<div class="vc-courses-grid">${cards}</div>`;

    grid.querySelectorAll('.vc-course-card').forEach(card => {
        card.addEventListener('click', () => {
            grid.querySelectorAll('.vc-course-card').forEach(c => {
                _vcRestaurarBadgeCard(c);
            });
            card.classList.add('active');

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
    const backdrop = document.getElementById('vcDetailBackdrop');
    const asigs  = _vcAsigs.filter(a => a.curso === cursoId);

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
                    <button class="btn-del vc-materia-remove"
                        data-asig-id="${a.id}"
                        data-profesor="${_escapeHtml(a.profesor_nombre)}"
                        data-curso="${nombre}"
                        data-materia="${_escapeHtml(a.materia_nombre)}">
                        ${_TRASH_ICON}
                    </button>
                </div>`;
        }).join('')
        : `<div class="empty-state vc-detail-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>
                Sin materias asignadas
            </div>`;

    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'vcDetailTitle');
    panel.innerHTML = `
        <div class="vc-detail-head">
            <div class="vc-detail-head-row">
                <div>
                    <div class="vc-detail-label">Carga Académica</div>
                    <div class="vc-detail-title" id="vcDetailTitle">${nombre}</div>
                </div>
                <button class="vc-detail-close" id="vcDetailClose">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="vc-detail-tags">
                ${nEstu ? `<span class="vc-detail-tag vc-detail-tag--stu">${nEstu} estudiante${nEstu !== 1 ? 's' : ''}</span>` : ''}
                <span class="vc-detail-tag vc-detail-tag--year">${asigs.length} materia${asigs.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
        <div class="vc-detail-body">
            <div class="vc-detail-section-title">Materias asignadas</div>
            ${materiasHtml}
        </div>`;

    split.classList.add('has-panel');

    document.getElementById('vcDetailClose').addEventListener('click', _cerrarVcDetail);
    if (backdrop) backdrop.onclick = _cerrarVcDetail;
    document.addEventListener('keydown', _vcCerrarConEscape);

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
    const panel = document.getElementById('vcDetail');
    panel.innerHTML = '';
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    panel.removeAttribute('aria-labelledby');
    const backdrop = document.getElementById('vcDetailBackdrop');
    if (backdrop) backdrop.onclick = null;
    document.removeEventListener('keydown', _vcCerrarConEscape);
    document.querySelectorAll('.vc-course-card').forEach(c => {
        _vcRestaurarBadgeCard(c);
    });
    _vcPanelCursoId = null;
}

function _vcCerrarConEscape(event) {
    if (event.key === 'Escape') _cerrarVcDetail();
}

function _vcRestaurarBadgeCard(card) {
    if (!card) return;
    card.classList.remove('active');
}

// ════════════════════════════════════════════════════════════════
// VISTA MATERIAS
// ════════════════════════════════════════════════════════════════

let _materiasRenderCache = [];

function _renderMateriasList(data, highlightId = null) {
    const wrap  = document.getElementById('wrapMaterias');
    const empty = document.getElementById('emptyMaterias');
    const tbody = document.getElementById('tbodyMaterias');
    if (!wrap || !empty || !tbody) return;

    _materiasRenderCache = Array.isArray(data) ? data : [];

    if (!_materiasRenderCache.length) {
        wrap.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    tbody.innerHTML = _materiasRenderCache.map((m, i) => `
        <article class="mat-item-card${String(m.id) === String(highlightId) ? ' mat-item-card--new' : ''}">
            <div class="mat-item-index">${i + 1}</div>
            <div class="mat-item-main">
                <div class="mat-item-name">
                    <span class="chip chip--blue">${_escapeHtml(m.nombre)}</span>
                </div>
            </div>
            <div class="mat-item-actions">
                <button class="mat-btn-edit" data-id="${m.id}" data-nombre="${_escapeHtml(m.nombre)}">
                    Editar
                </button>
                <button class="btn-del mat-btn-del" data-id="${m.id}" data-nombre="${_escapeHtml(m.nombre)}">
                    ${_TRASH_ICON} Eliminar
                </button>
            </div>
        </article>
    `).join('');

    tbody.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => eliminarMateria(btn.dataset.id, btn.dataset.nombre));
    });
    tbody.querySelectorAll('.mat-btn-edit').forEach(btn => {
        btn.addEventListener('click', () => _abrirModalEditarMateria(btn.dataset.id, btn.dataset.nombre));
    });

    wrap.style.display = 'block';
}

async function cargarMaterias(options = {}) {
    const highlightId = options?.highlightId ?? null;
    const notifyError = options?.notifyError !== false;
    const spinner = document.getElementById('spinnerMaterias');
    const wrap    = document.getElementById('wrapMaterias');
    const empty   = document.getElementById('emptyMaterias');

    spinner.style.display = 'flex';
    wrap.style.display    = 'none';
    empty.style.display   = 'none';

    const { ok, data } = await fetchAPI(`/api/academics/materias/?_=${Date.now()}`, { cache: 'no-store' });
    spinner.style.display = 'none';

    if (!ok) {
        if (_materiasRenderCache.length) {
            _renderMateriasList(_materiasRenderCache, highlightId);
        } else {
            empty.style.display = 'flex';
        }
        if (notifyError) {
            _mostrarResultadoAccion('error', 'No se cargó la lista', _mensajeErrorServidor(data, 'No se pudo cargar el listado de materias.'));
        }
        return false;
    }

    if (!Array.isArray(data) || !data.length) {
        empty.style.display = 'flex';
        _materiasRenderCache = [];
        return true;
    }

    _renderMateriasList(data, highlightId);
    return true;
}

const btnCrearMateria = document.getElementById('btnCrearMateria');
const formCrearMateria = document.getElementById('formCrearMateria');
const modalNuevaMateria = document.getElementById('modalNuevaMateria');
const btnAbrirCrearMateria = document.getElementById('btnAbrirCrearMateria');
const btnCancelNuevaMateria = document.getElementById('btnCancelNuevaMateria');
const modalEditarMateria = document.getElementById('modalEditarMateria');
const formEditarMateria = document.getElementById('formEditarMateria');
const btnGuardarEditarMateria = document.getElementById('btnGuardarEditarMateria');
const btnCancelEditarMateria = document.getElementById('btnCancelEditarMateria');
let _materiaEditId = null;

function _abrirModalNuevaMateria() {
    if (!modalNuevaMateria) return;
    const input = document.getElementById('inputNombreMateria');
    _ocultarError('errorMateria');
    if (input) input.value = '';
    modalNuevaMateria.classList.add('visible');
    setTimeout(() => input?.focus(), 0);
}

function _cerrarModalNuevaMateria() {
    modalNuevaMateria?.classList.remove('visible');
}

btnAbrirCrearMateria?.addEventListener('click', _abrirModalNuevaMateria);
btnCancelNuevaMateria?.addEventListener('click', _cerrarModalNuevaMateria);
modalNuevaMateria?.addEventListener('click', e => {
    if (e.target === modalNuevaMateria) _cerrarModalNuevaMateria();
});

function _abrirModalEditarMateria(id, nombre) {
    if (!modalEditarMateria) return;
    _materiaEditId = id;
    const input = document.getElementById('inputEditarMateria');
    _ocultarError('errorEditarMateria');
    if (input) {
        input.value = nombre || '';
        input.dataset.original = nombre || '';
    }
    modalEditarMateria.classList.add('visible');
    setTimeout(() => input?.focus(), 0);
}

function _cerrarModalEditarMateria() {
    modalEditarMateria?.classList.remove('visible');
    _materiaEditId = null;
}

btnCancelEditarMateria?.addEventListener('click', _cerrarModalEditarMateria);
modalEditarMateria?.addEventListener('click', e => {
    if (e.target === modalEditarMateria) _cerrarModalEditarMateria();
});

formEditarMateria?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!_materiaEditId) return;

    const input = document.getElementById('inputEditarMateria');
    const nombre = input?.value.trim() || '';
    const original = input?.dataset.original || '';
    _ocultarError('errorEditarMateria');

    if (!nombre) {
        _mostrarError('errorEditarMateriaMsg', 'errorEditarMateria', 'Escribe el nombre de la materia.');
        return;
    }
    if (nombre.toLowerCase() === original.trim().toLowerCase()) {
        _mostrarError('errorEditarMateriaMsg', 'errorEditarMateria', 'El nombre no cambió.');
        return;
    }

    btnGuardarEditarMateria.disabled = true;
    const { ok, data } = await fetchAPI(`/api/academics/materias/${_materiaEditId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre }),
    });
    btnGuardarEditarMateria.disabled = false;

    if (!ok) {
        const mensaje = _mensajeErrorServidor(data, 'No se pudo actualizar la materia.');
        _mostrarError('errorEditarMateriaMsg', 'errorEditarMateria', mensaje);
        _mostrarResultadoAccion('error', 'No se actualizó', mensaje);
        return;
    }

    const updatedId = data?.id || _materiaEditId;
    _cerrarModalEditarMateria();
    const nextMaterias = _materiasRenderCache
        .map(m => String(m.id) === String(updatedId) ? data : m)
        .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
    _renderMateriasList(nextMaterias, updatedId);

    const refreshed = await cargarMaterias({ highlightId: updatedId, notifyError: false });
    if (refreshed) {
        _mostrarResultadoAccion('success', 'Materia actualizada', `"${data.nombre}" se actualizó correctamente.`);
    } else {
        _mostrarResultadoAccion('warning', 'Materia actualizada', `"${data.nombre}" se guardó, pero no se pudo refrescar la lista automáticamente.`);
    }
});

if (btnCrearMateria) {
    const crearMateria = async event => {
        event?.preventDefault();
        const input  = document.getElementById('inputNombreMateria');
        if (!input) return;
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
            const mensaje = _mensajeErrorServidor(data, 'Error al crear la materia.');
            _mostrarError('errorMateriaMsg', 'errorMateria', mensaje);
            _mostrarResultadoAccion('error', 'No se añadió', mensaje);
            return;
        }

        input.value = '';
        _cerrarModalNuevaMateria();

        if (data?.id) {
            const nextMaterias = [
                ..._materiasRenderCache.filter(m => String(m.id) !== String(data.id)),
                data,
            ].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
            _renderMateriasList(nextMaterias, data.id);
        }

        const refreshed = await cargarMaterias({ highlightId: data?.id, notifyError: false });
        if (refreshed) {
            _mostrarResultadoAccion('success', 'Materia añadida', `"${data.nombre}" se añadió correctamente y ya está en la lista.`);
        } else {
            _mostrarResultadoAccion('warning', 'Materia guardada', `"${data.nombre}" se guardó, pero no se pudo refrescar la lista automáticamente.`);
        }
    };

    if (formCrearMateria) {
        formCrearMateria.addEventListener('submit', crearMateria);
    } else {
        btnCrearMateria.addEventListener('click', crearMateria);
    }
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
    const label = document.getElementById('planesMesLabel');
    const btnPrev = document.getElementById('planesMesPrev');
    const btnNext = document.getElementById('planesMesNext');
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const actualizarLabel = () => {
        if (label) label.textContent = meses[Number(sel.value)];
    };

    const moverMes = delta => {
        const actual = Number(sel.value);
        const siguiente = Math.min(12, Math.max(1, actual + delta));
        if (siguiente === actual) return;
        sel.value = String(siguiente);
        sel.dispatchEvent(new Event('change'));
    };

    // Preseleccionar mes actual
    sel.value = String(new Date().getMonth() + 1);
    actualizarLabel();
    sel.addEventListener('change', () => {
        actualizarLabel();
        _cargarPlanes(sel.value);
    });
    btnPrev?.addEventListener('click', () => moverMes(-1));
    btnNext?.addEventListener('click', () => moverMes(1));
})();

// Almacén de planes para el modal
let _planesData       = [];
let _planesStats      = { totalProfs: 0, incompletosProfs: 0 };
let _dirPlanAsigsByProf = {};   // profId → { nombre, pcs } — usado para stats de exportación

let _planesFiltro = 'todos';
let _planesRows = [];
let _planesSemanasPorPc = {};

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

    _planesRows = sortedProfs;
    _planesSemanasPorPc = semanasPorPc;
    _renderPlanesCards();
    return;

    container.innerHTML = `<div class="prof-planes-grid">${
        sortedProfs.map(([profId, prof]) => {
            const pcs = prof.pcs;
            const totalPlanes = pcs.length * 4;
            const filledPlanes = pcs.reduce((total, pc) => total + (semanasPorPc[pc.id]?.size || 0), 0);
            const progressPct = totalPlanes ? Math.round((filledPlanes / totalPlanes) * 100) : 0;
            const allComplete = totalPlanes > 0 && filledPlanes === totalPlanes;
            const visiblePcs = pcs;
            const hiddenCount = Math.max(0, pcs.length - visiblePcs.length);

            const coursesHtml = visiblePcs.map(pc => {
                const count = semanasPorPc[pc.id]?.size || 0;
                const complete = count === 4;
                const partial = count > 0 && count < 4;
                const label = pc.curso_nombre || 'Curso';
                return `
                    <button class="prof-planes-course${complete ? ' prof-planes-course--complete' : partial ? ' prof-planes-course--partial' : ''}" type="button" data-prof-id="${profId}" data-pc-id="${pc.id}" title="${_escapeHtml(label)}">
                        <span class="prof-planes-course__name">${_escapeHtml(label)}</span>
                    </button>`;
            }).join('');

            const subTxt = `${filledPlanes}/${totalPlanes} planes llenados`;

            return `
                <div class="prof-planes-card${allComplete ? ' prof-planes-card--complete' : ''}" data-prof-id="${profId}">
                    <div class="prof-planes-top">
                        <div class="prof-planes-avatar">${_iniciales(prof.nombre)}</div>
                        <div style="min-width:0;flex:1;">
                            <div class="prof-planes-name">${_escapeHtml(prof.nombre)}</div>
                            <div class="prof-planes-sub">${_escapeHtml(subTxt)}</div>
                        </div>
                    </div>
                    <div class="prof-planes-progress" aria-hidden="true">
                        <span class="prof-planes-progress__bar" style="--progress:${progressPct}%"></span>
                    </div>
                    <div class="prof-planes-course-list">
                        ${coursesHtml || '<div class="prof-planes-more">Sin cursos asignados</div>'}
                    </div>
                </div>`;
        }).join('')
    }</div>`;

    // Tarjetas clicables → ver planes (solo lectura)
    container.querySelectorAll('.prof-planes-course').forEach(chip => {
        chip.addEventListener('click', e => {
            e.stopPropagation();
            _abrirDirPlanModal(Number(chip.dataset.profId), Number(chip.dataset.pcId));
        });
    });
}

// ════════════════════════════════════════════════════════════════
// MODAL VER PLANES POR PROFESOR (solo lectura)
// ════════════════════════════════════════════════════════════════

function _renderPlanesCards() {
    const container = document.getElementById('planesContent');
    if (!container) return;

    const query = (document.getElementById('planesBuscarProfesor')?.value || '').trim().toLowerCase();
    const rows = _planesRows.filter(([, prof]) => {
        if (query && !String(prof.nombre || '').toLowerCase().includes(query)) return false;
        return _planesFiltro === 'todos' || _planesEstadoProfesor(prof, _planesSemanasPorPc) === _planesFiltro;
    });

    if (!rows.length) {
        container.innerHTML = '<div class="empty-state">No hay profesores para este filtro.</div>';
        return;
    }

    container.innerHTML = `<div class="prof-planes-grid">${
        rows.map(([profId, prof]) => _planesProfesorCardHtml(profId, prof, _planesSemanasPorPc)).join('')
    }</div>`;

    container.querySelectorAll('.prof-planes-course').forEach(chip => {
        chip.addEventListener('click', e => {
            e.stopPropagation();
            _abrirDirPlanModal(Number(chip.dataset.profId), Number(chip.dataset.pcId));
        });
    });
}

function _planesProfesorCardHtml(profId, prof, semanasPorPc) {
    const pcs = prof.pcs || [];
    const totalPlanes = pcs.length * 4;
    const filledPlanes = pcs.reduce((total, pc) => total + (semanasPorPc[pc.id]?.size || 0), 0);
    const progressPct = totalPlanes ? Math.round((filledPlanes / totalPlanes) * 100) : 0;
    const allComplete = totalPlanes > 0 && filledPlanes === totalPlanes;
    const coursesHtml = pcs.map(pc => {
        const count = semanasPorPc[pc.id]?.size || 0;
        const complete = count === 4;
        const partial = count > 0 && count < 4;
        const label = pc.curso_nombre || 'Curso';
        return `
            <button class="prof-planes-course${complete ? ' prof-planes-course--complete' : partial ? ' prof-planes-course--partial' : ''}" type="button" data-prof-id="${profId}" data-pc-id="${pc.id}" title="${_escapeHtml(label)}">
                <span class="prof-planes-course__name">${_escapeHtml(label)}</span>
            </button>`;
    }).join('');

    return `
        <div class="prof-planes-card${allComplete ? ' prof-planes-card--complete' : ''}" data-prof-id="${profId}">
            <div class="prof-planes-top">
                <div class="prof-planes-avatar">${_iniciales(prof.nombre)}</div>
                <div style="min-width:0;flex:1;">
                    <div class="prof-planes-name">${_escapeHtml(prof.nombre)}</div>
                    <div class="prof-planes-sub">${filledPlanes}/${totalPlanes} planes llenados</div>
                </div>
            </div>
            <div class="prof-planes-progress" aria-hidden="true">
                <span class="prof-planes-progress__bar" style="--progress:${progressPct}%"></span>
            </div>
            <div class="prof-planes-course-list">
                ${coursesHtml || '<div class="prof-planes-more">Sin cursos asignados</div>'}
            </div>
        </div>`;
}

function _planesEstadoProfesor(prof, semanasPorPc) {
    const pcs = prof.pcs || [];
    const totalPlanes = pcs.length * 4;
    const filledPlanes = pcs.reduce((total, pc) => total + (semanasPorPc[pc.id]?.size || 0), 0);
    if (totalPlanes > 0 && filledPlanes === totalPlanes) return 'completos';
    if (filledPlanes === 0) return 'sin-iniciar';
    return 'progreso';
}

function _setPlanesFiltro(filtro) {
    _planesFiltro = filtro || 'todos';
    const labels = {
        'todos': 'Todos',
        'completos': 'Completos',
        'progreso': 'En progreso',
        'sin-iniciar': 'No empezaron',
    };
    document.querySelectorAll('[data-planes-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.planesFilter === _planesFiltro);
    });
    const summary = document.getElementById('planesFilterSummary');
    if (summary) summary.textContent = labels[_planesFiltro] || 'Todos';
    document.querySelector('.planes-filter-menu')?.removeAttribute('open');
    _renderPlanesCards();
}

(function _initPlanesFilters() {
    document.querySelectorAll('[data-planes-filter]').forEach(btn => {
        btn.addEventListener('click', () => _setPlanesFiltro(btn.dataset.planesFilter));
    });
    document.getElementById('planesBuscarProfesor')?.addEventListener('input', _renderPlanesCards);
})();

(function _initDirPlanModal() {
    const overlay = document.getElementById('dirPlanOverlay');
    const cerrar  = () => overlay.classList.remove('visible');
    document.getElementById('btnCerrarDirPlan').addEventListener('click', cerrar);
    document.getElementById('btnCerrarDirPlan2').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
})();

function _abrirDirPlanModal(profId, pcId = null) {
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

let _dirPlanSemanaLectura = 1;
let _dirPlanLecturaCtx = null;

function _abrirDirPlanModal(profId, pcId = null) {
    const prof = _dirPlanAsigsByProf[profId];
    const mes = Number(document.getElementById('planesMesSel').value);
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    if (!prof) return;

    _dirPlanSemanaLectura = 1;
    const planesPorSemana = { 1: [], 2: [], 3: [], 4: [] };
    _planesData
        .filter(p => p.profesor_id === profId)
        .filter(p => !pcId || p.profesor_curso_id === pcId)
        .forEach(p => {
            if (!planesPorSemana[p.semana]) planesPorSemana[p.semana] = [];
            planesPorSemana[p.semana].push(p);
        });

    const selectedPc = pcId ? (prof.pcs || []).find(pc => pc.id === pcId) : null;
    _dirPlanLecturaCtx = { prof, mes, meses, planesPorSemana, selectedPc };
    document.getElementById('dirPlanTitle').textContent = `Planificacion Semanal: ${meses[mes]} ${new Date().getFullYear()}`;
    _renderDirPlanTitleChips(prof);
    document.getElementById('dirPlanSub').innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        ${_escapeHtml(prof.nombre)} - vista solo lectura para direccion.`;

    _renderDirPlanLecturaSidebar();
    _renderDirPlanLecturaContent();
    document.getElementById('dirPlanOverlay').classList.add('visible');
}

function _renderDirPlanTitleChips(prof) {
    const chips = document.getElementById('dirPlanTitleChips');
    if (!chips) return;

    const planesSemana = _dirPlanLecturaCtx?.planesPorSemana?.[_dirPlanSemanaLectura] || [];
    const selectedPc = _dirPlanLecturaCtx?.selectedPc;
    const fuente = selectedPc ? [selectedPc] : (planesSemana.length ? planesSemana : (prof.pcs || []));
    const materias = [...new Set(fuente.map(item => item.materia_nombre).filter(Boolean))];
    const cursos = [...new Set(fuente.map(item => item.curso_nombre).filter(Boolean))];
    const materiaLabel = materias.length === 1
        ? materias[0]
        : `${materias.length || 0} materias`;
    const cursoLabel = cursos.length === 1
        ? cursos[0]
        : `${cursos.length || 0} cursos`;

    chips.innerHTML = `
        <span class="pm-title-chip" title="${_escapeHtml(prof.nombre || 'Profesor')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${_escapeHtml(prof.nombre || 'Profesor')}</span>
        </span>
        <span class="pm-title-chip pm-title-chip--subject" title="${_escapeHtml(materiaLabel)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <span>${_escapeHtml(materiaLabel)}</span>
        </span>
        <span class="pm-title-chip pm-title-chip--course" title="${_escapeHtml(cursoLabel)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <span>${_escapeHtml(cursoLabel)}</span>
        </span>`;
}

const _DIR_PLAN_SVG_CAL_OK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>`;
const _DIR_PLAN_SVG_CAL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

function _renderDirPlanLecturaSidebar() {
    const list = document.getElementById('dirPlanWeekList');
    if (!_dirPlanLecturaCtx || !list) return;

    list.innerHTML = [1, 2, 3, 4].map(semana => {
        const saved = (_dirPlanLecturaCtx.planesPorSemana[semana] || []).length > 0;
        const active = semana === _dirPlanSemanaLectura;
        return `<button class="pm-week-item${active ? ' pm-week-item--active' : ''}" data-s="${semana}">
            <span class="pm-week-icon">${saved ? _DIR_PLAN_SVG_CAL_OK : _DIR_PLAN_SVG_CAL}</span>
            <span>Semana ${semana}</span>
            ${saved ? '<span class="pm-week-saved-dot"></span>' : ''}
        </button>`;
    }).join('');

    list.querySelectorAll('.pm-week-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const semana = Number(btn.dataset.s);
            if (semana === _dirPlanSemanaLectura) return;
            _dirPlanSemanaLectura = semana;
            _renderDirPlanLecturaSidebar();
            _renderDirPlanTitleChips(_dirPlanLecturaCtx.prof);
            _renderDirPlanLecturaContent();
        });
    });
}

function _renderDirPlanLecturaContent() {
    const body = document.getElementById('dirPlanBody');
    if (!_dirPlanLecturaCtx || !body) return;

    const { mes, meses, planesPorSemana, selectedPc } = _dirPlanLecturaCtx;
    const planes = [...(planesPorSemana[_dirPlanSemanaLectura] || [])].sort((a, b) =>
        String(a.curso_nombre || '').localeCompare(String(b.curso_nombre || '')) ||
        String(a.materia_nombre || '').localeCompare(String(b.materia_nombre || ''))
    );
    const rango = _dirPlanLecturaPeriodo(mes, _dirPlanSemanaLectura, planes[0]);
    const ordinal = ['', 'primera', 'segunda', 'tercera', 'cuarta'];
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
                <p class="pm-content-sub">Planes registrados para la ${ordinal[_dirPlanSemanaLectura]} semana de ${meses[mes]}.</p>
            </div>
        </div>`;

    if (!planes.length) {
        body.innerHTML = `${headerHtml}<div class="pm-readonly-text pm-readonly-text--empty">Sin plan registrado para esta semana.</div>`;
        return;
    }

    body.innerHTML = `${headerHtml}
        <div class="dir-plan-readonly-list">
            ${planes.map(p => `
                <article class="dir-plan-readonly-item">
                    <div class="dir-plan-readonly-head">${_escapeHtml(selectedPc?.curso_nombre || p.curso_nombre || 'Curso')}</div>
                    <div class="dir-plan-readonly-text">${_escapeHtml(p.descripcion || 'Sin descripcion.')}</div>
                </article>
            `).join('')}
        </div>`;
}

function _dirPlanLecturaPeriodo(mes, semana, plan = null) {
    if (plan?.fecha_inicio && plan?.fecha_fin) {
        return `${_dirPlanLecturaFmtFecha(plan.fecha_inicio)} - ${_dirPlanLecturaFmtFecha(plan.fecha_fin)}`;
    }
    const year = new Date().getFullYear();
    const first = new Date(year, mes - 1, 1);
    const dowMon = (first.getDay() + 6) % 7;
    const daysToMonday = (7 - dowMon) % 7;
    const start = new Date(year, mes - 1, 1 + daysToMonday + (semana - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${_dirPlanLecturaFmtDate(start)} - ${_dirPlanLecturaFmtDate(end)}`;
}

function _dirPlanLecturaFmtFecha(value) {
    return _dirPlanLecturaFmtDate(new Date(`${value}T00:00:00`));
}

function _dirPlanLecturaFmtDate(date) {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${date.getDate()} de ${meses[date.getMonth()]}`;
}

async function _ejecutarDescargaExcel() {
    const mes = document.getElementById('planesMesSel').value;
    const btn = document.getElementById('btnExportarPlanes');
    const meses = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const SVG_DOWNLOAD = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Descargar Planes`;

    btn.disabled = true;
    btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .7s linear infinite">
            <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
        </svg>
        Generando…`;

    const token = localStorage.getItem('access_token');
    try {
        if (!token) {
            throw new Error('Tu sesion expiro. Vuelve a iniciar sesion para descargar el Excel.');
        }
        _mostrarResultadoAccion('info', 'Iniciando descarga', `Preparando el Excel de planes de trabajo de ${meses[mes]}.`);

        const res = await fetch(`/api/academics/director/planes/exportar/?mes=${mes}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
            const err = await _leerErrorExportacion(res);
            throw new Error(err || `No se pudo generar el Excel. Error ${res.status}.`);
        }
        const blob = await res.blob();
        if (!blob.size) {
            throw new Error('El servidor genero un archivo vacio.');
        }
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `planes_trabajo_${meses[mes]}_2026.xlsx`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        _mostrarResultadoAccion('success', 'Descarga iniciada', 'El Excel se esta descargando en tu navegador.');
    } catch (e) {
        _mostrarResultadoAccion('error', 'No se pudo descargar', e.message || 'No se pudo descargar el archivo.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = SVG_DOWNLOAD;
    }
}

async function _leerErrorExportacion(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => null);
        return _mensajeErrorServidor(data, '');
    }
    const text = await res.text().catch(() => '');
    return text ? text.slice(0, 180) : '';
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

document.getElementById('btnNavDescargarPlanes')?.addEventListener('click', _abrirModalExportMes);
document.getElementById('btnCerrarExportMes').addEventListener('click', _cerrarModalExportMes);
document.getElementById('btnCancelarExportMes').addEventListener('click', _cerrarModalExportMes);
_modalExportMes.addEventListener('click', e => { if (e.target === _modalExportMes) _cerrarModalExportMes(); });

_btnConfExport.addEventListener('click', async () => {
    const mes = Number(_exportMesSel.value);
    _btnConfExport.disabled = true;
    const meses = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const token = localStorage.getItem('access_token');
    try {
        if (!token) {
            _mostrarResultadoAccion('error', 'No se pudo descargar', 'Tu sesion expiro. Vuelve a iniciar sesion para descargar el Excel.');
            return;
        }
        _mostrarResultadoAccion('info', 'Iniciando descarga', `Preparando el Excel de planes de trabajo de ${meses[mes]}.`);

        const res = await fetch(`/api/academics/director/planes/exportar/?mes=${mes}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
            const mensaje = await _leerErrorExportacion(res);
            _mostrarResultadoAccion('error', 'No se pudo descargar', mensaje || 'No hay planes para ese mes.');
            return;
        }
        const blob = await res.blob();
        if (!blob.size) {
            _mostrarResultadoAccion('error', 'No se pudo descargar', 'El servidor genero un archivo vacio.');
            return;
        }
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `planes_trabajo_${meses[mes]}.xlsx`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        _mostrarResultadoAccion('success', 'Descarga iniciada', 'El Excel se esta descargando en tu navegador.');
        _cerrarModalExportMes();
    } catch (e) {
        _mostrarResultadoAccion('error', 'No se pudo descargar', e.message || 'No se pudo descargar el archivo.');
    } finally {
        _btnConfExport.disabled = false;
    }
});

document.getElementById('btnExportarPlanes').addEventListener('click', () => {
    // Sin datos en absoluto → bloquear
    if (_planesData.length === 0) {
        _mostrarResultadoAccion('error', 'No se puede descargar', 'No hay planes registrados para este mes. No se puede generar el Excel.');
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
        action:    password => _eliminarAsignacionProfesorRequest(id, password),
        onSuccess: onSuccess || _cargarVistaProfesor,
        skipPreAuth: true,
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

    if (!_delConfig.skipPreAuth) {
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
    }

    const { ok, data } = await _delConfig.action(password);

    delConfirmar.disabled = false;
    delConfirmarText.style.display    = '';
    delConfirmarSpinner.style.display = 'none';

    if (!ok) {
        delPassError.textContent = _mensajeErrorServidor(data);
        delPassInput.classList.add('input-error');
        delPassInput.focus();
        return;
    }

    const onSuccess = _delConfig.onSuccess;
    const toastMsg  = _delConfig.toastMsg || `"${_delConfig.nombre}" actualizado.`;
    const toastTitle = _delConfig.successTitle || 'Acción completada';
    _cerrarDelModal();
    _mostrarResultadoAccion('success', toastTitle, toastMsg);
    await onSuccess();
});


// ════════════════════════════════════════════════════════════════
// VISTA NOTAS POR PROFESOR
// ════════════════════════════════════════════════════════════════

const _MESES_NOMBRE = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

let _pnDatos      = [];   // datos de la última carga
let _pnMes        = new Date().getMonth() + 1;
let _pnFiltro     = 'todos';
let _pnIniciado   = false;

// ── Inicialización (lazy: solo la primera vez que se activa el pivot) ──
function _pnActivar() {
    if (!_pnIniciado) {
        _pnIniciado = true;
        _pnInicializar();
    }
}

function _pnInicializar() {
    document.getElementById('pnMesPrev')?.addEventListener('click', () => _pnMoverMes(-1));
    document.getElementById('pnMesNext')?.addEventListener('click', () => _pnMoverMes(1));
    document.getElementById('pnBuscarProfesor')?.addEventListener('input', _pnAplicarFiltro);

    // Pastillas de filtro — solo esconden/muestran, sin re-fetch
    document.querySelectorAll('.pn-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            _pnFiltro = btn.dataset.filter;
            document.querySelectorAll('.pn-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _pnAplicarFiltro();
        });
    });

    // Modal picker
    document.getElementById('pnPickerCancel').addEventListener('click', _pnCerrarPicker);
    document.getElementById('pnPickerOverlay').addEventListener('click', e => {
        if (e.target === document.getElementById('pnPickerOverlay')) _pnCerrarPicker();
    });

    _pnActualizarBadge();
    _pnCargar();
}

function _pnMoverMes(delta) {
    const siguiente = Math.min(12, Math.max(1, _pnMes + delta));
    if (siguiente === _pnMes) return;
    _pnMes = siguiente;
    _pnActualizarBadge();
    _pnCargar();
}

function _pnActualizarBadge() {
    const badgeText = document.getElementById('pnMesBadgeText');
    if (badgeText) badgeText.textContent = _MESES_NOMBRE[_pnMes] || '–';
    const label = document.getElementById('pnMesLabel');
    if (label) label.textContent = _MESES_NOMBRE[_pnMes] || '–';
}

// ── Carga de datos ────────────────────────────────────────────────
async function _pnCargar() {
    _pnActualizarBadge();
    const grid = document.getElementById('pnGrid');
    grid.innerHTML = '<div class="spinner-inline"></div>';

    const { ok, data } = await fetchAPI(`/api/academics/director/resumen-notas-mes/?mes=${_pnMes}`);
    if (!ok) {
        grid.innerHTML = `<div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Error al cargar los datos.
        </div>`;
        return;
    }

    _pnDatos = data.profesores || [];
    _pnActualizarContadores();
    _pnRenderGrid();
}

// ── Contadores de tabs ────────────────────────────────────────────
function _pnActualizarContadores() {
    const completados = _pnDatos.filter(p => p.total_cursos > 0 && p.cursos_con_notas === p.total_cursos).length;
    const progreso = _pnDatos.filter(p => p.cursos_con_notas > 0 && p.cursos_con_notas < p.total_cursos).length;
    const noIniciado = _pnDatos.filter(p => (p.cursos_con_notas || 0) === 0).length;
    const countTodos = document.getElementById('pnCountTodos');
    const countCompletados = document.getElementById('pnCountCompletados');
    const countProgreso = document.getElementById('pnCountProgreso');
    const countNoIniciado = document.getElementById('pnCountNoIniciado');
    if (countTodos) countTodos.textContent = _pnDatos.length;
    if (countCompletados) countCompletados.textContent = completados;
    if (countProgreso) countProgreso.textContent = progreso;
    if (countNoIniciado) countNoIniciado.textContent = noIniciado;

    const summaryTodos = document.getElementById('pnSummaryTodos');
    const summaryCompletados = document.getElementById('pnSummaryCompletados');
    const summaryFaltantes = document.getElementById('pnSummaryFaltantes');
    const summaryCaption = document.getElementById('pnSummaryCaption');

    if (summaryTodos) summaryTodos.textContent = _pnDatos.length;
    if (summaryCompletados) summaryCompletados.textContent = completados;
    if (summaryFaltantes) summaryFaltantes.textContent = progreso + noIniciado;
    if (summaryCaption) {
        if (!_pnDatos.length) {
            summaryCaption.textContent = 'No hay profesores registrados para mostrar en este mes.';
        } else if (progreso + noIniciado === 0) {
            summaryCaption.textContent = `Todos los profesores cerraron su carga de notas en ${_MESES_NOMBRE[_pnMes]}.`;
        } else {
            const pendientes = progreso + noIniciado;
            summaryCaption.textContent = `${pendientes} profesor${pendientes !== 1 ? 'es' : ''} requieren seguimiento en ${_MESES_NOMBRE[_pnMes]}.`;
        }
    }
}

// ── Render completo del grid (una sola vez tras la carga) ─────────
function _pnRenderGrid() {
    const grid = document.getElementById('pnGrid');

    if (!_pnDatos.length) {
        grid.innerHTML = `<div class="empty-state pn-grid-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            No hay profesores registrados.
        </div>`;
        return;
    }

    // Render TODOS los cards con data-estado para el filtro por CSS
    grid.innerHTML = _pnDatos.map((p, i) => _pnHtmlCard(p, i)).join('') +
        `<div class="empty-state pn-empty-filtered">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span id="pnEmptyFilteredMsg">Sin resultados para este filtro.</span>
        </div>`;

    // Attach chip handlers
    grid.querySelectorAll('.pn-chip--ok').forEach(chip => {
        const profIdx  = parseInt(chip.dataset.profIdx,  10);
        const cursoIdx = parseInt(chip.dataset.cursoIdx, 10);
        chip.addEventListener('click', () => _pnChipClick(profIdx, cursoIdx));
    });

    // Aplicar filtro inicial (Todos por defecto)
    _pnAplicarFiltro();
}

// ── Filtro por CSS — sin re-fetch, sin re-render ──────────────────
function _pnAplicarFiltro() {
    const cards  = document.querySelectorAll('.pn-card[data-estado]');
    const query = (document.getElementById('pnBuscarProfesor')?.value || '').trim().toLowerCase();
    let   visible = 0;

    cards.forEach(card => {
        const estado = card.dataset.estado;
        const search = card.dataset.search || '';
        let mostrar = true;
        if (_pnFiltro === 'completados') mostrar = estado === 'completo';
        if (_pnFiltro === 'progreso') mostrar = estado === 'progreso';
        if (_pnFiltro === 'no-iniciado') mostrar = estado === 'no-iniciado';
        if (query && !search.includes(query)) mostrar = false;
        card.style.display = mostrar ? '' : 'none';
        if (mostrar) visible++;
    });

    // Mensaje vacío si ninguna tarjeta visible
    const emptyEl  = document.querySelector('.pn-empty-filtered');
    const msgEl    = document.getElementById('pnEmptyFilteredMsg');
    if (emptyEl) {
        emptyEl.style.display = visible === 0 ? '' : 'none';
        if (msgEl && visible === 0) {
            const msgs = {
                completados: `Ningún profesor completó todas sus notas en ${_MESES_NOMBRE[_pnMes]}.`,
                progreso:    `Ningún profesor está en progreso en ${_MESES_NOMBRE[_pnMes]}.`,
                'no-iniciado': `No hay profesores sin iniciar en ${_MESES_NOMBRE[_pnMes]}.`,
            };
            msgEl.textContent = query ? 'No se encontraron profesores con ese nombre.' : (msgs[_pnFiltro] || 'Sin resultados.');
        }
    }
}

// ── HTML de una tarjeta de profesor ──────────────────────────────
function _pnHtmlCard(p, profIdx) {
    const estaCompleto = p.total_cursos > 0 && p.cursos_con_notas === p.total_cursos;
    const estaEnProgreso = !estaCompleto && (p.cursos_con_notas || 0) > 0;
    const estadoAttr = estaCompleto ? 'completo' : estaEnProgreso ? 'progreso' : 'no-iniciado';
    const statusText = estaCompleto ? 'Completo' : estaEnProgreso ? 'En progreso' : 'No iniciado';
    const statusCls = estaCompleto ? 'pn-status--ok' : estaEnProgreso ? 'pn-status--warn' : 'pn-status--empty';
    const searchText = `${p.nombre || ''} ${p.username || ''}`.toLowerCase();
    const chips = p.cursos.map((c, cursoIdx) => {
        if (c.tiene_notas) {
            return `<button
                class="pn-chip pn-chip--ok"
                data-prof-idx="${profIdx}"
                data-curso-idx="${cursoIdx}"
                title="Ver notas de ${_escapeHtml(c.curso_nombre)}">
                ${_escapeHtml(c.curso_nombre)}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </button>`;
        }
        return `<span class="pn-chip pn-chip--pending" title="Sin notas para ${_escapeHtml(c.curso_nombre)}">
            ${_escapeHtml(c.curso_nombre)}
        </span>`;
    }).join('');

    return `<article class="pn-card${estaCompleto ? ' pn-card--ok' : ''}" data-estado="${estadoAttr}" data-search="${_escapeHtml(searchText)}">
        <div class="pn-card-accent"></div>
        <div class="pn-card-top">
            <div class="pn-card-head">
                <div class="pn-avatar-shell">
                    <div class="pn-avatar${estaCompleto ? ' pn-avatar--ok' : ''}">${_escapeHtml(p.iniciales)}</div>
                </div>
                <div class="pn-card-meta">
                    <div class="pn-card-name">${_escapeHtml(p.nombre)}</div>
                    <div class="pn-card-username">@${_escapeHtml(p.username)}</div>
                </div>
            </div>
            <span class="pn-status ${statusCls}">${statusText}</span>
        </div>
        <div class="pn-card-body">
            ${p.cursos.length ? `<div class="pn-chips-label">Cursos asignados</div>
            <div class="pn-chips">${chips}</div>` : `<div class="pn-no-courses">Sin asignaciones en este periodo.</div>`}
        </div>
    </article>`;
}

// ── Clic en chip verde ────────────────────────────────────────────
function _pnChipClick(profIdx, cursoIdx) {
    // Buscar el profesor en _pnDatos (puede estar filtrado, buscar por posición en original)
    const prof  = _pnDatos[profIdx];
    if (!prof) return;
    const curso = prof.cursos[cursoIdx];
    if (!curso || !curso.tiene_notas) return;

    const pcIds = curso.pc_ids_con_notas;
    if (!pcIds || !pcIds.length) return;

    if (pcIds.length === 1) {
        // Navegar directamente
        _pnNavegar(pcIds[0].pc_id, prof.nombre, curso.curso_nombre, pcIds[0].materia);
    } else {
        // Mostrar picker de materias
        _pnAbrirPicker(pcIds, prof.nombre, curso.curso_nombre);
    }
}

function _pnNavegar(pcId, profesor, curso, materia) {
    window.location.href = `/director/notas-curso/?pc_id=${pcId}&mes=${_pnMes}`;
}

// ── Modal picker de materia ───────────────────────────────────────
function _pnAbrirPicker(pcIds, profNombre, cursoNombre) {
    document.getElementById('pnPickerSub').textContent =
        `${cursoNombre} — ${profNombre} tiene varias materias con notas para ${_MESES_NOMBRE[_pnMes]}.`;

    const list = document.getElementById('pnPickerList');
    list.innerHTML = pcIds.map(pc => `
        <div class="pn-picker-item" data-pc-id="${pc.pc_id}" data-materia="${_escapeHtml(pc.materia)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            ${_escapeHtml(pc.materia)}
        </div>
    `).join('');

    list.querySelectorAll('.pn-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            _pnCerrarPicker();
            _pnNavegar(parseInt(item.dataset.pcId, 10));
        });
    });

    document.getElementById('pnPickerOverlay').classList.add('visible');
}

function _pnCerrarPicker() {
    document.getElementById('pnPickerOverlay').classList.remove('visible');
}
