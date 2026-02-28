'use strict';

/* ================================================================
   curso_estudiantes.js — Lista de estudiantes de un curso
   CURSO_ID debe estar definido antes de cargar este script.
   ================================================================ */

const API_STUDENTS = `/api/students/?curso=${CURSO_ID}`;
const API_CREAR    = '/api/students/crear/';

// ── Estado ────────────────────────────────────────────────────────
let _estudiantes = [];
let _cursoNombre = '';

// ── DOM refs ──────────────────────────────────────────────────────
const pageTitle       = document.getElementById('pageTitle');
const fCursoNombre    = document.getElementById('fCursoNombre');
const tbody           = document.getElementById('tbodyEstudiantes');
const tableCount      = document.getElementById('tableCount');
const searchInput     = document.getElementById('searchInput');

const drawer          = document.getElementById('drawer');
const drawerBackdrop  = document.getElementById('drawerBackdrop');
const btnNuevo        = document.getElementById('btnNuevoEstudiante');
const btnCerrar       = document.getElementById('btnCerrarDrawer');
const btnCancelar     = document.getElementById('btnCancelarDrawer');
const btnGuardar      = document.getElementById('btnGuardar');
const btnGuardarText  = document.getElementById('btnGuardarText');
const btnGuardarSpinner = document.getElementById('btnGuardarSpinner');

const modalBackdrop   = document.getElementById('modalBackdrop');
const credUser        = document.getElementById('credUser');
const credPass        = document.getElementById('credPass');
const modalEstudiante = document.getElementById('modalEstudiante');
const btnModalOk      = document.getElementById('btnModalOk');

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setGuardando(on) {
    btnGuardar.disabled = on;
    btnGuardarText.classList.toggle('hidden', on);
    btnGuardarSpinner.classList.toggle('hidden', !on);
}

function inputError(el, msg) {
    el.classList.add('input-error');
    let hint = el.parentElement.querySelector('.input-error-msg');
    if (!hint) {
        hint = document.createElement('p');
        hint.className = 'input-error-msg';
        el.parentElement.appendChild(hint);
    }
    hint.textContent = msg;
}

function clearErrors() {
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.input-error-msg').forEach(el => el.remove());
}

// ── Tabla ─────────────────────────────────────────────────────────
function renderTabla(lista) {
    if (!lista.length) {
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="5">No se encontraron estudiantes.</td></tr>`;
        tableCount.textContent = '0 registros';
        return;
    }
    tbody.innerHTML = lista.map((e, i) => `
        <tr>
            <td class="td-num">${i + 1}</td>
            <td class="td-name">${escHtml(e.nombre_completo)}</td>
            <td class="td-muted">${e.carnet ? escHtml(e.carnet) : '<span class="no-data">—</span>'}</td>
            <td>${escHtml(e.tutor_nombre)}</td>
            <td class="td-mono">${escHtml(e.tutor_username)}</td>
        </tr>
    `).join('');
    tableCount.textContent = `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`;
}

searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    renderTabla(!q ? _estudiantes : _estudiantes.filter(e =>
        e.nombre_completo.toLowerCase().includes(q) ||
        (e.carnet || '').toLowerCase().includes(q)
    ));
});

// ── Drawer ────────────────────────────────────────────────────────
function abrirDrawer() {
    clearErrors();
    ['fNombre','fApellidos','fCarnet','fTutorNombre','fTutorApellidos','fTutorCarnet'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    drawer.classList.add('drawer--open');
    drawerBackdrop.classList.add('visible');
    document.getElementById('fNombre').focus();
}

function cerrarDrawer() {
    drawer.classList.remove('drawer--open');
    drawerBackdrop.classList.remove('visible');
}

btnNuevo.addEventListener('click', abrirDrawer);
btnCerrar.addEventListener('click', cerrarDrawer);
btnCancelar.addEventListener('click', cerrarDrawer);
drawerBackdrop.addEventListener('click', cerrarDrawer);

// ── Guardar ───────────────────────────────────────────────────────
btnGuardar.addEventListener('click', async () => {
    clearErrors();

    const nombre         = document.getElementById('fNombre').value.trim();
    const apellidos      = document.getElementById('fApellidos').value.trim();
    const carnet         = document.getElementById('fCarnet').value.trim();
    const tutorNombre    = document.getElementById('fTutorNombre').value.trim();
    const tutorApellidos = document.getElementById('fTutorApellidos').value.trim();
    const tutorCarnet    = document.getElementById('fTutorCarnet').value.trim();

    let valido = true;
    if (!nombre)         { inputError(document.getElementById('fNombre'),         'Campo obligatorio.'); valido = false; }
    if (!apellidos)      { inputError(document.getElementById('fApellidos'),      'Campo obligatorio.'); valido = false; }
    if (!tutorNombre)    { inputError(document.getElementById('fTutorNombre'),    'Campo obligatorio.'); valido = false; }
    if (!tutorApellidos) { inputError(document.getElementById('fTutorApellidos'), 'Campo obligatorio.'); valido = false; }
    if (!tutorCarnet)    { inputError(document.getElementById('fTutorCarnet'),    'Campo obligatorio.'); valido = false; }
    if (!valido) return;

    setGuardando(true);

    const { ok, data } = await fetchAPI(API_CREAR, {
        method: 'POST',
        body: JSON.stringify({
            nombre, apellidos,
            carnet: carnet || '',
            curso: CURSO_ID,
            tutor_nombre:    tutorNombre,
            tutor_apellidos: tutorApellidos,
            tutor_carnet:    tutorCarnet,
        }),
    });

    setGuardando(false);
    if (!ok) return;

    _estudiantes.unshift(data.estudiante);
    renderTabla(_estudiantes);
    cerrarDrawer();
    mostrarCredenciales(data.estudiante, data.credenciales_tutor);
});

// ── Modal credenciales ────────────────────────────────────────────
function mostrarCredenciales(estudiante, creds) {
    modalEstudiante.textContent = estudiante.nombre_completo;
    credUser.textContent = creds.username;
    credPass.textContent = creds.password;
    modalBackdrop.classList.add('visible');
}

btnModalOk.addEventListener('click', () => modalBackdrop.classList.remove('visible'));

document.querySelectorAll('.cred-copy').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = document.getElementById(btn.dataset.target).textContent;
        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        });
    });
});

// ── Inicializar ───────────────────────────────────────────────────
(async () => {
    // Nombre del curso ya viene del contexto Django
    _cursoNombre = CURSO_NOMBRE;
    pageTitle.textContent    = _cursoNombre;
    fCursoNombre.textContent = _cursoNombre;

    // Cargar estudiantes del curso
    const { ok, data } = await fetchAPI(API_STUDENTS);
    if (!ok) return;
    _estudiantes = Array.isArray(data) ? data : [];
    renderTabla(_estudiantes);
})();
