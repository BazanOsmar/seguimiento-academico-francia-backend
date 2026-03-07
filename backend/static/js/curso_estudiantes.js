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
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="6">No se encontraron estudiantes.</td></tr>`;
        tableCount.textContent = '0 registros';
        return;
    }
    tbody.innerHTML = lista.map((e, i) => `
        <tr class="tr-clickable" data-href="/director/estudiantes/${CURSO_ID}/${e.id}/">
            <td class="td-num">${i + 1}</td>
            <td class="td-name">${escHtml(e.nombre_completo)}</td>
            <td class="td-muted">${e.identificador ? escHtml(e.identificador) : '<span class="no-data">—</span>'}</td>
            <td>${e.tutor_nombre ? escHtml(e.tutor_nombre) : '<span style="color:var(--danger);font-size:.82rem;">Sin tutor aún</span>'}</td>
            <td class="td-mono">${e.tutor_username ? escHtml(e.tutor_username) : '<span style="color:var(--danger);font-size:.82rem;">—</span>'}</td>
            <td>${e.activo
                ? '<span class="badge badge--success">Activo</span>'
                : '<span class="badge badge--danger">Inactivo</span>'
            }</td>
        </tr>
    `).join('');
    tbody.querySelectorAll('.tr-clickable').forEach(tr => {
        tr.addEventListener('click', () => window.location.href = tr.dataset.href);
    });
    tableCount.textContent = `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`;
}

searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    renderTabla(!q ? _estudiantes : _estudiantes.filter(e =>
        e.nombre_completo.toLowerCase().includes(q) ||
        (e.identificador || '').toLowerCase().includes(q)
    ));
});

// ── Username auto-generado ─────────────────────────────────────────
let _usernameEditado = false;

function _normalizar(texto) {
    return texto.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
}

function _generarUsername(nombre, apellidos) {
    const n = _normalizar(nombre);
    const a = _normalizar(apellidos);
    return (n.slice(0, 1) + a.slice(0, 11)).slice(0, 12);
}

function _actualizarUsername() {
    if (_usernameEditado) return;
    const nombre    = document.getElementById('fTutorNombre').value.trim();
    const apellidos = document.getElementById('fTutorApellidos').value.trim();
    const input     = document.getElementById('fTutorUsername');
    const tag       = document.getElementById('usernameAutoTag');
    const generado  = _generarUsername(nombre, apellidos);
    input.value = generado;
    if (tag) tag.style.display = generado ? 'inline' : 'none';
}

// ── Drawer ────────────────────────────────────────────────────────
function abrirDrawer() {
    clearErrors();
    _usernameEditado = false;
    ['fNombre','fApellidoPaterno','fApellidoMaterno','fTutorNombre','fTutorApellidos','fTutorUsername'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const tag = document.getElementById('usernameAutoTag');
    if (tag) tag.style.display = 'none';
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

document.getElementById('fTutorNombre').addEventListener('input', _actualizarUsername);
document.getElementById('fTutorApellidos').addEventListener('input', _actualizarUsername);
document.getElementById('fTutorUsername').addEventListener('input', () => {
    _usernameEditado = true;
    const tag = document.getElementById('usernameAutoTag');
    if (tag) tag.style.display = 'none';
});

// ── Guardar ───────────────────────────────────────────────────────
btnGuardar.addEventListener('click', async () => {
    clearErrors();

    const nombre           = document.getElementById('fNombre').value.trim();
    const apellidoPaterno  = document.getElementById('fApellidoPaterno').value.trim();
    const apellidoMaterno  = document.getElementById('fApellidoMaterno').value.trim();
    const tutorNombre      = document.getElementById('fTutorNombre').value.trim();
    const tutorApellidos   = document.getElementById('fTutorApellidos').value.trim();
    const tutorUsername    = document.getElementById('fTutorUsername').value.trim();
    let valido = true;
    if (!nombre)         { inputError(document.getElementById('fNombre'),         'Campo obligatorio.'); valido = false; }
    if (!apellidoPaterno && !apellidoMaterno) { inputError(document.getElementById('fApellidoPaterno'), 'Al menos un apellido es obligatorio.'); valido = false; }
    if (!tutorNombre)    { inputError(document.getElementById('fTutorNombre'),    'Campo obligatorio.'); valido = false; }
    if (!tutorApellidos) { inputError(document.getElementById('fTutorApellidos'), 'Campo obligatorio.'); valido = false; }
    if (!tutorUsername)  { inputError(document.getElementById('fTutorUsername'),  'Campo obligatorio.'); valido = false; }
    if (!valido) return;

    setGuardando(true);

    const { ok, data } = await fetchAPI(API_CREAR, {
        method: 'POST',
        body: JSON.stringify({
            nombre,
            apellido_paterno: apellidoPaterno,
            apellido_materno: apellidoMaterno,
            curso: CURSO_ID,
            tutor_nombre:    tutorNombre,
            tutor_apellidos: tutorApellidos,
            tutor_username:  tutorUsername,
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
