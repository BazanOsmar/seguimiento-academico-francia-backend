'use strict';

/* ================================================================
   curso_estudiantes.js — Lista de estudiantes de un curso
   CURSO_ID debe estar definido antes de cargar este script.
   ================================================================ */

const API_STUDENTS  = `/api/students/?curso=${CURSO_ID}`;
const API_CREAR_SOLO = '/api/students/crear-solo/';

// ── Estado ────────────────────────────────────────────────────────
let _estudiantes = [];
let _cursoNombre = '';

// ── DOM refs ──────────────────────────────────────────────────────
const pageTitle         = document.getElementById('pageTitle');
const tbody             = document.getElementById('tbodyEstudiantes');
const searchInput       = document.getElementById('searchInput');
const totalNum          = document.getElementById('totalNum');
const cursoTitleSpan    = document.getElementById('cursoTitleSpan');
const btnNuevo          = document.getElementById('btnNuevoEstudiante');

// Modal materias
const btnToggleMaterias = document.getElementById('btnToggleMaterias');
const modalMatOverlay   = document.getElementById('modalMateriasOverlay');
const modalMatRows      = document.getElementById('modalMatRows');
const modalMatCursoLbl  = document.getElementById('modalMatCursoLabel');

// Modal añadir estudiante
const modalAEOverlay    = document.getElementById('modalAEOverlay');
const formAE            = document.getElementById('formAE');
const aeNombre          = document.getElementById('aeNombre');
const aePaterno         = document.getElementById('aePaterno');
const aeMaterno         = document.getElementById('aeMaterno');
const aeCursoNombre     = document.getElementById('aeCursoNombre');
const aeCourseBadge     = document.getElementById('aeCourseBadge');
const aeError           = document.getElementById('aeError');
const btnGuardarAE      = document.getElementById('btnGuardarAE');
const btnGuardarAEText  = document.getElementById('btnGuardarAEText');
const btnGuardarAESpinner = document.getElementById('btnGuardarAESpinner');

// Modal éxito
const modalBackdrop     = document.getElementById('modalBackdrop');
const modalEstudiante   = document.getElementById('modalEstudiante');
const credCodigo        = document.getElementById('credCodigo');
const btnModalOk        = document.getElementById('btnModalOk');

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setGuardando(on) {
    btnGuardarAE.disabled = on;
    btnGuardarAEText.classList.toggle('hidden', on);
    btnGuardarAESpinner.classList.toggle('hidden', !on);
}

// ── Tabla ─────────────────────────────────────────────────────────
const SVG_CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
const SVG_CROSS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>`;

function renderTabla(lista) {
    if (!lista.length) {
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="4">No se encontraron estudiantes.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map((e, i) => {
        const nro        = String(i + 1).padStart(2, '0');
        const nombreCls  = e.activo ? 'td-name' : 'td-name td-nombre--inactivo';
        const tutorHtml  = e.tutor_nombre
            ? `<span class="tutor-check">${SVG_CHECK}</span>`
            : `<span class="tutor-cross">${SVG_CROSS}</span>`;
        const estadoHtml = e.activo
            ? '<span class="badge-activo">Activo</span>'
            : '<span class="badge-baja">Dado de baja</span>';
        return `
        <tr class="tr-clickable" data-href="/director/estudiantes/${CURSO_ID}/${e.id}/">
            <td class="td-mono" style="font-size:13px">${nro}</td>
            <td class="${nombreCls}">${escHtml(e.nombre_completo)}</td>
            <td class="td-tutor-icon">${tutorHtml}</td>
            <td>${estadoHtml}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.tr-clickable').forEach(tr => {
        tr.addEventListener('click', () => window.location.href = tr.dataset.href);
    });
}

searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    renderTabla(!q ? _estudiantes : _estudiantes.filter(e =>
        e.nombre_completo.toLowerCase().includes(q) ||
        (e.identificador || '').toLowerCase().includes(q)
    ));
});

// ── Modal Materias ────────────────────────────────────────────────
let _materiasCargadas = false;

async function abrirModalMaterias() {
    if (!modalMatOverlay) return;
    if (modalMatCursoLbl) modalMatCursoLbl.textContent = _cursoNombre;
    modalMatOverlay.classList.add('visible');

    if (_materiasCargadas) return;
    _materiasCargadas = true;

    const { ok, data } = await fetchAPI(`/api/academics/cursos/${CURSO_ID}/materias/`);
    if (!ok || !data?.length) {
        modalMatRows.innerHTML = `<div class="modal-mat-row" style="color:var(--text-muted);font-size:13px;grid-column:1/-1">Sin materias asignadas a este curso.</div>`;
        return;
    }
    modalMatRows.innerHTML = data.map(m => `
        <div class="modal-mat-row">
            <span class="modal-mat-row__mat">${escHtml(m.materia)}</span>
            <span class="modal-mat-row__prof">${escHtml(m.profesor)}</span>
        </div>`).join('');
}

function cerrarModalMaterias() {
    modalMatOverlay?.classList.remove('visible');
}

btnToggleMaterias?.addEventListener('click', abrirModalMaterias);
document.getElementById('btnCerrarModalMat')?.addEventListener('click', cerrarModalMaterias);
document.getElementById('btnModalMatCerrar')?.addEventListener('click', cerrarModalMaterias);
modalMatOverlay?.addEventListener('click', e => { if (e.target === modalMatOverlay) cerrarModalMaterias(); });

// ── Modal Añadir Estudiante ───────────────────────────────────────
function abrirModalAE() {
    aeNombre.value  = '';
    aePaterno.value = '';
    aeMaterno.value = '';
    aeError.style.display = 'none';
    [aeNombre, aePaterno, aeMaterno].forEach(el => el.classList.remove('input-error'));
    modalAEOverlay.classList.add('visible');
    aeNombre.focus();
}

function cerrarModalAE() {
    modalAEOverlay.classList.remove('visible');
}

btnNuevo?.addEventListener('click', abrirModalAE);
document.getElementById('btnCerrarAE')?.addEventListener('click', cerrarModalAE);
document.getElementById('btnCancelarAE')?.addEventListener('click', cerrarModalAE);
modalAEOverlay?.addEventListener('click', e => { if (e.target === modalAEOverlay) cerrarModalAE(); });

formAE?.addEventListener('submit', async e => {
    e.preventDefault();

    const nombre   = aeNombre.value.trim();
    const paterno  = aePaterno.value.trim();
    const materno  = aeMaterno.value.trim();

    // Validación
    let valido = true;
    [aeNombre, aePaterno, aeMaterno].forEach(el => el.classList.remove('input-error'));
    aeError.style.display = 'none';

    if (!nombre) { aeNombre.classList.add('input-error'); valido = false; }
    if (!paterno && !materno) {
        aePaterno.classList.add('input-error');
        aeMaterno.classList.add('input-error');
        valido = false;
    }
    if (!valido) {
        aeError.textContent = 'Por favor completa los campos requeridos.';
        aeError.style.display = 'block';
        return;
    }

    setGuardando(true);

    const { ok, data } = await fetchAPI(API_CREAR_SOLO, {
        method: 'POST',
        body: JSON.stringify({
            nombre,
            apellido_paterno: paterno,
            apellido_materno: materno,
            curso: CURSO_ID,
        }),
    });

    setGuardando(false);

    if (!ok) {
        aeError.textContent = data?.errores || 'Error al guardar. Intenta nuevamente.';
        aeError.style.display = 'block';
        return;
    }

    // Éxito
    _estudiantes.unshift(data);
    if (totalNum) totalNum.textContent = String(_estudiantes.length).padStart(3, '0');
    renderTabla(_estudiantes);
    cerrarModalAE();
    mostrarExito(data);
});

// ── Modal éxito ───────────────────────────────────────────────────
function mostrarExito(estudiante) {
    modalEstudiante.textContent = estudiante.nombre_completo;
    credCodigo.textContent = estudiante.identificador || '—';
    modalBackdrop.classList.add('visible');
}

btnModalOk?.addEventListener('click', () => modalBackdrop.classList.remove('visible'));

document.querySelectorAll('.cred-copy').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = document.getElementById(btn.dataset.target).textContent;
        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        });
    });
});

// ── Escape key ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modalAEOverlay?.classList.contains('visible'))    cerrarModalAE();
    else if (modalMatOverlay?.classList.contains('visible')) cerrarModalMaterias();
});

// ── Inicializar ───────────────────────────────────────────────────
(async () => {
    _cursoNombre = CURSO_NOMBRE;
    pageTitle.textContent = _cursoNombre;
    if (cursoTitleSpan)  cursoTitleSpan.textContent = _cursoNombre;
    if (aeCursoNombre)   aeCursoNombre.textContent  = _cursoNombre;
    if (aeCourseBadge)   aeCourseBadge.textContent  = `Curso: ${_cursoNombre}`;

    const { ok, data } = await fetchAPI(API_STUDENTS);
    if (!ok) return;
    _estudiantes = Array.isArray(data) ? data : [];
    if (totalNum) totalNum.textContent = String(_estudiantes.length).padStart(3, '0');
    renderTabla(_estudiantes);
})();
