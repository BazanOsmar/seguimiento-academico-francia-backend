'use strict';

/* ================================================================
   academico.js — Gestión Académica (Materias + Asignaciones)
   ================================================================ */

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
        await Promise.all([cargarSelectores(), cargarAsignaciones()]);
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

async function eliminarMateria(id, nombre) {
    if (!confirm(`¿Eliminar la materia "${nombre}"? Esta acción no se puede deshacer.`)) return;

    const { ok, data } = await fetchAPI(`/api/academics/materias/${id}/`, { method: 'DELETE' });

    if (!ok) {
        showToast(data?.errores || 'Error al eliminar la materia.', 'error');
        return;
    }

    showToast(`Materia "${nombre}" eliminada.`, 'success');
    await cargarMaterias();
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

    const profesores = (resUsuarios.data?.usuarios || []).filter(u => u.tipo_usuario === 'Profesor');

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
                <button class="btn-del" data-id="${a.id}">
                    ${_TRASH_ICON} Eliminar
                </button>
            </td>`;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => eliminarAsignacion(btn.dataset.id));
    });

    wrap.style.display = 'block';
}

document.getElementById('btnCrearAsignacion').addEventListener('click', async () => {
    const profesor = document.getElementById('selProfesor').value;
    const curso    = document.getElementById('selCurso').value;
    const materia  = document.getElementById('selMateria').value;

    _ocultarError('errorAsignacion');

    if (!profesor || !curso || !materia) {
        _mostrarError('errorAsignacionMsg', 'errorAsignacion', 'Selecciona profesor, curso y materia.');
        return;
    }

    const btn    = document.getElementById('btnCrearAsignacion');
    btn.disabled = true;

    const { ok, data } = await fetchAPI('/api/academics/asignaciones/', {
        method: 'POST',
        body: JSON.stringify({
            profesor: parseInt(profesor),
            curso:    parseInt(curso),
            materia:  parseInt(materia),
        }),
    });

    btn.disabled = false;

    if (!ok) {
        _mostrarError('errorAsignacionMsg', 'errorAsignacion',
            data?.errores || 'Error al crear la asignación.');
        return;
    }

    showToast('Profesor asignado correctamente.', 'success');
    await cargarAsignaciones();
});

async function eliminarAsignacion(id) {
    if (!confirm('¿Eliminar esta asignación?')) return;

    const { ok, data } = await fetchAPI(`/api/academics/asignaciones/${id}/`, { method: 'DELETE' });

    if (!ok) {
        showToast(data?.errores || 'No se pudo eliminar la asignación.', 'error');
        return;
    }

    showToast('Asignación eliminada.', 'success');
    await cargarAsignaciones();
}
