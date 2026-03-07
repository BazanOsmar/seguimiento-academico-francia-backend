'use strict';

/* ================================================================
   academico.js — Gestión Académica (Materias + Asignaciones)
   ================================================================ */

// ══════════════════════════════════════════════════════════════════
// VISTA POR PROFESOR
// ══════════════════════════════════════════════════════════════════

let _vpAsignaciones  = [];   // todas las asignaciones cargadas
let _vpProfesores    = [];   // lista de profesores (del endpoint /api/users/)
let _vpProfSelId     = null; // profesor actualmente seleccionado

const cardTablaAsig  = document.getElementById('cardTablaAsignaciones');
const vistaProfesor  = document.getElementById('vistaProfesor');
const vpProfList     = document.getElementById('vpProfList');
const vpContent      = document.getElementById('vpContent');
const btnVistaTabla  = document.getElementById('btnVistaTabla');
const btnVistaProf   = document.getElementById('btnVistaProfesor');

function _iniciales(nombre) {
    const parts = nombre.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

// ── Toggle entre vistas ───────────────────────────────────────────
btnVistaTabla.addEventListener('click', async () => {
    btnVistaTabla.classList.add('active');
    btnVistaProf.classList.remove('active');
    cardTablaAsig.style.display = '';
    vistaProfesor.style.display = 'none';
    await cargarAsignaciones();
});

btnVistaProf.addEventListener('click', async () => {
    btnVistaProf.classList.add('active');
    btnVistaTabla.classList.remove('active');
    cardTablaAsig.style.display = 'none';
    vistaProfesor.style.display = '';
    await _cargarVistaProfesor();
});

// ── Carga datos para vista profesor ───────────────────────────────
async function _cargarVistaProfesor() {
    vpProfList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:.85rem;">Cargando…</div>';

    const [resAsig, resUsers] = await Promise.all([
        fetchAPI('/api/academics/asignaciones/'),
        fetchAPI('/api/users/'),
    ]);

    _vpAsignaciones = resAsig.data || [];
    _vpProfesores   = (resUsers.data?.usuarios || []).filter(u => u.rol === 'Profesor');

    // Agrupar por profesor
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

// ── Sidebar de profesores ─────────────────────────────────────────
function _renderVpSidebar(grupos) {
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
            const grupo  = grupos.find(g => g.id === profId);
            _renderVpCards(grupo);
        });
    });

    // Auto-seleccionar el primero
    vpProfList.querySelector('.vp-prof-item')?.click();
}

// ── Cards de asignaciones del profesor seleccionado ───────────────
function _renderVpCards(grupo) {
    vpContent.innerHTML = `
        <div class="vp-content-header">
            <div class="vp-content-title">${grupo.nombre}</div>
            <span class="vp-content-sub">${grupo.asigs.length} asignación${grupo.asigs.length !== 1 ? 'es' : ''}</span>
        </div>
        <div class="vp-cards-grid" id="vpCardsGrid"></div>`;

    const grid = document.getElementById('vpCardsGrid');
    grid.innerHTML = grupo.asigs.map(a => _asigCardHtml(a)).join('');

    grid.querySelectorAll('.asig-card').forEach(card => {
        const id      = Number(card.dataset.id);
        const asig    = grupo.asigs.find(a => a.id === id);

        card.querySelector('.asig-btn-del').addEventListener('click', () => {
            eliminarAsignacion(asig.id, asig.profesor_nombre, asig.curso_nombre, asig.materia_nombre, async () => {
                await _cargarVistaProfesor();
                // Re-seleccionar el mismo profesor si aún tiene asignaciones
                const item = vpProfList.querySelector(`[data-prof-id="${_vpProfSelId}"]`);
                item ? item.click() : null;
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

// ── Modo edición: cambiar profesor ────────────────────────────────
function _activarModoEdicion(card, asig, grupo) {
    card.classList.add('editing');

    const otrosProfesores = _vpProfesores.filter(p => p.id !== asig.profesor);
    const opciones = otrosProfesores.map(p =>
        `<option value="${p.id}">${p.first_name} ${p.last_name}`.trim() + `</option>`
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
        const nuevoProf = _vpProfesores.find(p => p.id === nuevoProfId);
        const nombreNuevo = `${nuevoProf.first_name} ${nuevoProf.last_name}`.trim();

        _abrirDelModal({
            nombre: `${asig.materia_nombre} — ${asig.curso_nombre}`,
            confirmLabel: 'Confirmar cambio',
            toastMsg: `Profesor cambiado a ${nombreNuevo} correctamente.`,
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
                await _cargarVistaProfesor();
                // Seleccionar el profesor nuevo (el que recibió la asignación)
                const item = vpProfList.querySelector(`[data-prof-id="${nuevoProfId}"]`);
                item ? item.click() : vpProfList.querySelector('.vp-prof-item')?.click();
            },
        });
    });
}

// ── Inicialización ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _initSidebar();
    _initLogout();
    _initUserInfo();
    _initTabs();
    cargarMaterias();
});

// ── Tabs ──────────────────────────────────────────────────────────
function _initTabs() {
    document.getElementById('tabMaterias').addEventListener('click', () => _activarTab('Materias'));
    document.getElementById('tabAsignaciones').addEventListener('click', async () => {
        _activarTab('Asignaciones');
        await Promise.all([cargarSelectores(), _cargarVistaProfesor()]);
    });
}

function _activarTab(nombre) {
    document.querySelectorAll('.acad-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.acad-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab${nombre}`).classList.add('active');
    document.getElementById(`panel${nombre}`).classList.add('active');
}

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

    function openSidebar()  { sidebar.classList.add('sidebar--open');    backdrop.classList.add('visible'); }
    function closeSidebar() { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); }

    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()
    );
    backdrop.addEventListener('click', closeSidebar);
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

// ── Helpers de UI ─────────────────────────────────────────────────
function _mostrarError(msgId, containerId, texto) {
    const container = document.getElementById(containerId);
    const msg       = document.getElementById(msgId);
    msg.textContent        = texto;
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

// ══════════════════════════════════════════════════════════════════
// MATERIAS
// ══════════════════════════════════════════════════════════════════

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
        document.getElementById('countMaterias').textContent  = '0';
        document.getElementById('badgeMaterias').textContent  = '0';
        return;
    }

    document.getElementById('countMaterias').textContent = data.length;
    document.getElementById('badgeMaterias').textContent = data.length;

    tbody.innerHTML = '';
    data.forEach((m, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="num-cell">${i + 1}</td>
            <td class="name-cell">
                <span class="chip chip--blue">${m.nombre}</span>
            </td>
            <td style="text-align:right;padding-right:18px;">
                <button class="btn-del" data-id="${m.id}" data-nombre="${m.nombre}">
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

// ── Modal de eliminación genérico (materias y asignaciones) ───────
let _delConfig = null;  // { endpoint, label, nombre, warnings[], onSuccess }

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

const _WARN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
</svg>`;

function _abrirDelModal(config) {
    _delConfig = config;
    document.getElementById('delStep1Title').textContent    = config.step1Title || '¿Confirmar acción?';
    document.getElementById('delStep1Subtitle').textContent = config.step1Subtitle || 'Revisa los detalles antes de continuar.';
    delMateriaNombre.textContent  = config.nombre;
    delMateriaNombre2.textContent = config.nombre;
    delStep2Subtitle.innerHTML    = `Ingresa tu contraseña para autorizar esta acción sobre <strong>${config.nombre}</strong>.`;
    delConfirmarText.textContent  = config.confirmLabel || 'Confirmar';
    delConfirmar.style.background = config.confirmBg || '#ef4444';
    delWarnList.innerHTML = config.warnings.map(w =>
        `<div class="del-warn-item">${_WARN_SVG}${w}</div>`
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
    delConfirmarText.style.display = 'none';
    delConfirmarSpinner.style.display = 'block';

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const { ok: loginOk } = await fetchAPI('/api/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username: user?.username, password }),
    });

    if (!loginOk) {
        delConfirmar.disabled = false;
        delConfirmarText.style.display = '';
        delConfirmarSpinner.style.display = 'none';
        delPassError.textContent = 'Contraseña incorrecta. Intenta de nuevo.';
        delPassInput.classList.add('input-error');
        delPassInput.focus();
        return;
    }

    // Ejecutar la acción configurada (genérica)
    const { ok, data } = await _delConfig.action();

    delConfirmar.disabled = false;
    delConfirmarText.style.display = '';
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
        action: () => fetchAPI(`/api/academics/materias/${id}/`, { method: 'DELETE' }),
        onSuccess: cargarMaterias,
    });
}

// ══════════════════════════════════════════════════════════════════
// ASIGNACIONES
// ══════════════════════════════════════════════════════════════════

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

async function cargarAsignaciones() {
    const spinner = document.getElementById('spinnerAsignaciones');
    const wrap    = document.getElementById('wrapAsignaciones');
    const empty   = document.getElementById('emptyAsignaciones');
    const tbody   = document.getElementById('tbodyAsignaciones');

    spinner.style.display = 'flex';
    wrap.style.display    = 'none';
    empty.style.display   = 'none';

    const { ok, data } = await fetchAPI('/api/academics/asignaciones/');

    spinner.style.display = 'none';

    if (!ok || !data.length) {
        empty.style.display = 'flex';
        document.getElementById('countAsignaciones').textContent = '0';
        document.getElementById('badgeAsignaciones').textContent = '0';
        return;
    }

    document.getElementById('countAsignaciones').textContent = data.length;
    document.getElementById('badgeAsignaciones').textContent = data.length;

    tbody.innerHTML = '';
    data.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="name-cell">${a.profesor_nombre}</td>
            <td><span class="chip chip--purple">${a.curso_nombre}</span></td>
            <td><span class="chip chip--teal">${a.materia_nombre}</span></td>
            <td style="text-align:right;padding-right:18px;">
                <button class="btn-del" data-id="${a.id}"
                    data-profesor="${a.profesor_nombre}"
                    data-curso="${a.curso_nombre}"
                    data-materia="${a.materia_nombre}">
                    ${_TRASH_ICON} Eliminar
                </button>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => eliminarAsignacion(
            btn.dataset.id,
            btn.dataset.profesor,
            btn.dataset.curso,
            btn.dataset.materia,
        ));
    });

    wrap.style.display = 'block';

    // Mostrar buscador y conectar filtro
    const searchWrap = document.getElementById('asigSearchWrap');
    const searchInput = document.getElementById('asigSearchInput');
    const searchCount = document.getElementById('asigSearchCount');
    searchWrap.style.display = 'flex';
    searchInput.value = '';
    searchCount.textContent = '';

    searchInput.oninput = () => {
        const q = searchInput.value.trim().toLowerCase();
        const filas = tbody.querySelectorAll('tr');
        let visibles = 0;
        filas.forEach(tr => {
            const texto = tr.textContent.toLowerCase();
            const mostrar = !q || texto.includes(q);
            tr.style.display = mostrar ? '' : 'none';
            if (mostrar) visibles++;
        });
        searchCount.textContent = q
            ? `${visibles} de ${filas.length} resultado${visibles !== 1 ? 's' : ''}`
            : '';
    };
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
            selProfesor.value = '';
            selCurso.value    = '';
            selMateria.value  = '';
            await _cargarVistaProfesor();
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
        action: () => fetchAPI(`/api/academics/asignaciones/${id}/`, { method: 'DELETE' }),
        onSuccess: onSuccess || _cargarVistaProfesor,
    });
}
