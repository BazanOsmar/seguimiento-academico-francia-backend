/* ================================================================
   comunicados.js — Citaciones (individual | curso | colegio)
   ================================================================ */

'use strict';

// ── Estado global ─────────────────────────────────────────────────
let todasCitaciones = [];
let filtroActivo    = 'PENDIENTE';
let filtroEmisor    = 'Director';

// ── Helpers ───────────────────────────────────────────────────────
const MOTIVO_LABELS = {
    FALTAS:      'Faltas',
    ATRASOS:     'Atrasos',
    CONDUCTA:    'Conducta',
    RENDIMIENTO: 'Rendimiento',
    DOCUMENTOS:  'Documentos',
    REUNION:     'Reunión',
    OTRO:        'Otro',
};

function formatFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function estadoBadgeHTML(asistencia) {
    const map = {
        PENDIENTE:  { cls: 'estado-badge--pendiente',  txt: 'Pendiente' },
        ASISTIO:    { cls: 'estado-badge--asistio',    txt: 'Asistió'   },
        NO_ASISTIO: { cls: 'estado-badge--no_asistio', txt: 'No asistió'},
        ATRASO:     { cls: 'estado-badge--atraso',     txt: 'Atraso'    },
    };
    const cfg = map[asistencia] || { cls: '', txt: asistencia };
    return `<span class="estado-badge ${cfg.cls}">${cfg.txt}</span>`;
}

// ── Tarjetas de citaciones ────────────────────────────────────────
function renderCards(citaciones) {
    const grid   = document.getElementById('citacionesGrid');
    const footer = document.getElementById('gridFooter');

    if (!citaciones.length) {
        grid.innerHTML = `
            <div class="empty-cards">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="11" y2="17"/>
                </svg>
                <p>No hay citaciones${filtroActivo ? ' con este filtro' : ''}.</p>
            </div>`;
        footer.textContent = '';
        return;
    }

    footer.textContent = `${citaciones.length} citación${citaciones.length !== 1 ? 'es' : ''}`;

    grid.innerHTML = citaciones.map(c => `
        <div class="citacion-card" data-status="${c.asistencia}" data-id="${c.id}">
            <div class="citacion-card__header">
                <div style="flex:1;min-width:0;">
                    <p class="citacion-card__nombre">${c.estudiante_nombre}</p>
                    <div class="citacion-card__meta">
                        <span class="badge-curso">${c.curso}</span>
                        <span class="citacion-card__motivo citacion-card__motivo--${c.motivo}">${MOTIVO_LABELS[c.motivo] || c.motivo}</span>
                    </div>
                </div>
                <div style="flex-shrink:0;">${estadoBadgeHTML(c.asistencia)}</div>
            </div>
            ${c.descripcion ? `
            <div class="citacion-card__body">
                <p class="citacion-card__desc">${c.descripcion}</p>
            </div>` : ''}
            <div class="citacion-card__foot">
                <span class="citacion-card__foot-label">Fecha límite</span>
                <span class="citacion-card__foot-val">${formatFecha(c.fecha_limite_asistencia)}</span>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.citacion-card').forEach(card => {
        card.addEventListener('click', () => abrirModalDetalle(card.dataset.id));
    });
}

function mostrarSkeletonCards() {
    const grid = document.getElementById('citacionesGrid');
    grid.innerHTML = Array(6).fill(0).map(() => `
        <div class="citacion-card citacion-card--skeleton">
            <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
                <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
                    <div class="skel-cell" style="width:65%;height:15px;"></div>
                    <div class="skel-cell" style="width:40%;height:12px;"></div>
                </div>
                <div class="skel-cell" style="width:72px;height:24px;border-radius:50px;"></div>
            </div>
            <div style="display:flex;gap:16px;margin-top:10px;">
                <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
                    <div class="skel-cell" style="width:50%;height:10px;"></div>
                    <div class="skel-cell" style="width:70%;height:12px;"></div>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
                    <div class="skel-cell" style="width:50%;height:10px;"></div>
                    <div class="skel-cell" style="width:40%;height:12px;"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ── Carga de datos ─────────────────────────────────────────────────
async function cargarCitaciones() {
    mostrarSkeletonCards();
    const { ok, data } = await fetchAPI('/api/discipline/citaciones/');
    if (!ok) return;
    todasCitaciones = data;
    if (badgeCitaciones) badgeCitaciones.textContent = data.length;
    aplicarFiltro();
}

function aplicarFiltro() {
    let filtradas = todasCitaciones;
    if (filtroActivo) filtradas = filtradas.filter(c => c.asistencia === filtroActivo);
    if (filtroEmisor) filtradas = filtradas.filter(c => c.emisor_tipo === filtroEmisor);
    if (filtroActivo === 'PENDIENTE') {
        filtradas = [...filtradas].sort((a, b) =>
            new Date(a.fecha_limite_asistencia) - new Date(b.fecha_limite_asistencia)
        );
    }
    renderCards(filtradas);
}

// ── Chips estado ──────────────────────────────────────────────────
document.querySelectorAll('.chip-filtro:not(.chip-emisor)').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-filtro:not(.chip-emisor)').forEach(c => c.classList.remove('chip-filtro--active'));
        chip.classList.add('chip-filtro--active');
        filtroActivo = chip.dataset.filtro;
        aplicarFiltro();
    });
});

// ── Select emisor ─────────────────────────────────────────────────
document.getElementById('selectEmisor').addEventListener('change', function () {
    filtroEmisor = this.value;
    aplicarFiltro();
});

// ── Refs del formulario inline ─────────────────────────────────────
const formNueva         = document.getElementById('formNuevaCitacion');
const selectCurso       = document.getElementById('nuevaCurso');
const selectEstud       = document.getElementById('nuevaEstudiante');
const radiosEnvio       = document.querySelectorAll('input[name="tipoEnvio"]');
const radiosAlcance     = document.querySelectorAll('input[name="comAlcance"]');
const seccionCitacion   = document.getElementById('seccionCitacion');
const seccionComunicado = document.getElementById('seccionComunicado');
const wrapComGrado      = document.getElementById('wrapComGrado');
const wrapComCurso      = document.getElementById('wrapComCurso');
const rowCursoEstud     = document.getElementById('rowCursoEstud');
const wrapCurso         = document.getElementById('wrapCurso');
const wrapEstudiante    = document.getElementById('wrapEstudiante');
const progressMsg       = document.getElementById('progressMsg');
const errorNueva        = document.getElementById('errorNueva');
const btnEnviarNueva    = document.getElementById('btnEnviarNueva');
const btnEnviarTexto    = document.getElementById('btnEnviarTexto');
const btnLimpiarForm    = document.getElementById('btnLimpiarForm');

let fpFechaLimite     = null;
let fpFechaExpiracion = null;
let _cursosCache      = [];  // usado para grados únicos

function getTipoEnvio() {
    return document.querySelector('input[name="tipoEnvio"]:checked').value;
}

function getAlcance() {
    return document.querySelector('input[name="comAlcance"]:checked').value;
}

// ── Cambio entre Citación / Comunicado ───────────────────────────
radiosEnvio.forEach(r => {
    r.addEventListener('change', () => {
        const envio = getTipoEnvio();
        if (envio === 'comunicado') {
            seccionCitacion.style.display   = 'none';
            seccionComunicado.style.display = '';
            btnEnviarTexto.textContent      = 'Enviar comunicado';
        } else {
            seccionCitacion.style.display   = '';
            seccionComunicado.style.display = 'none';
            btnEnviarTexto.textContent      = 'Enviar citación';
        }
        errorNueva.style.display  = 'none';
        progressMsg.style.display = 'none';
    });
});

// ── Cambio de alcance del comunicado ─────────────────────────────
radiosAlcance.forEach(r => {
    r.addEventListener('change', () => {
        const alcance = getAlcance();
        wrapComGrado.style.display = alcance === 'GRADO' ? '' : 'none';
        wrapComCurso.style.display = alcance === 'CURSO' ? '' : 'none';
    });
});

function resetForm() {
    formNueva.reset();
    if (fpFechaLimite)     fpFechaLimite.clear();
    if (fpFechaExpiracion) fpFechaExpiracion.clear();

    // Restaurar sección citación
    seccionCitacion.style.display   = '';
    seccionComunicado.style.display = 'none';

    // Ocultar selectores de alcance
    wrapComGrado.style.display = 'none';
    wrapComCurso.style.display = 'none';

    // Restaurar fila curso/estudiante
    rowCursoEstud.style.display  = '';
    wrapCurso.style.opacity      = '1';
    selectCurso.disabled         = false;

    // Limpiar estudiante
    selectEstud.innerHTML        = '<option value="">— Selecciona estudiante —</option>';
    selectEstud.disabled         = true;
    wrapEstudiante.style.opacity = '0.45';

    // Limpiar mensajes
    progressMsg.style.display = 'none';
    errorNueva.style.display  = 'none';

    // Restaurar botón
    btnEnviarNueva.disabled      = false;
    btnEnviarNueva.style.display = '';
    btnEnviarTexto.textContent   = 'Enviar citación';
    btnLimpiarForm.style.display = 'none';

    // Selecciones por defecto
    document.querySelector('input[name="tipoEnvio"][value="citacion"]').checked = true;
    document.querySelector('input[name="comAlcance"][value="TODOS"]').checked   = true;
}


// ── Carga inicial de cursos ───────────────────────────────────────
async function cargarCursosForm() {
    selectCurso.innerHTML = '<option value="">Cargando...</option>';
    selectCurso.disabled  = true;
    const { ok, data } = await fetchAPI('/api/academics/cursos/');
    selectCurso.disabled = false;
    if (!ok || !data.length) {
        selectCurso.innerHTML = '<option value="">— Sin cursos —</option>';
        return;
    }
    _cursosCache = data;

    // Select de citación (curso para filtrar estudiante)
    selectCurso.innerHTML = '<option value="">— Selecciona curso —</option>'
        + data.map(c => `<option value="${c.id}">${c.grado} ${c.paralelo}</option>`).join('');

    // Select de comunicado — todos los cursos
    const comCursoSel = document.getElementById('comCurso');
    comCursoSel.innerHTML = '<option value="">— Selecciona curso —</option>'
        + data.map(c => `<option value="${c.id}">${c.grado} ${c.paralelo}</option>`).join('');

    // Select de grado — valores únicos ordenados
    const grados = [...new Set(data.map(c => c.grado))].sort();
    const comGradoSel = document.getElementById('comGrado');
    comGradoSel.innerHTML = '<option value="">— Selecciona grado —</option>'
        + grados.map(g => `<option value="${g}">${g}</option>`).join('');
}

// ── Cambio de curso → carga estudiantes ──────────────────────────
selectCurso.addEventListener('change', async () => {
    const cursoId = selectCurso.value;

    selectEstud.innerHTML        = '<option value="">— Selecciona estudiante —</option>';
    selectEstud.disabled         = true;
    wrapEstudiante.style.opacity = '0.45';

    if (!cursoId) return;

    selectEstud.innerHTML = '<option value="">Cargando...</option>';
    const { ok, data } = await fetchAPI(`/api/students/curso/${cursoId}/estudiantes/`);
    if (!ok || !data.length) {
        selectEstud.innerHTML = '<option value="">— Sin estudiantes —</option>';
        return;
    }
    selectEstud.innerHTML = '<option value="">— Selecciona estudiante —</option>'
        + data.map(e => `<option value="${e.id}">${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}</option>`).join('');
    selectEstud.disabled         = false;
    wrapEstudiante.style.opacity = '1';
});

// ── Flatpickr para fecha límite ───────────────────────────────────
const _FP_LOCALE_ES = {
    firstDayOfWeek: 1,
    weekdays: {
        shorthand: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],
        longhand:  ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"],
    },
    months: {
        shorthand: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
        longhand:  ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
    },
    rangeSeparator: " a ",
    time_24hr: true,
};

function initFlatpickrs() {
    if (typeof flatpickr === 'undefined') return;
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const maxFecha = new Date();
    maxFecha.setFullYear(maxFecha.getFullYear() + 1);

    const inputLimite = document.getElementById('nuevaFechaLimite');
    if (inputLimite) {
        fpFechaLimite = flatpickr(inputLimite, {
            locale:        _FP_LOCALE_ES,
            dateFormat:    'Y-m-d',
            minDate:       manana,
            maxDate:       maxFecha,
            disableMobile: true,
        });
    }

    const inputExp = document.getElementById('comFechaExpiracion');
    if (inputExp) {
        fpFechaExpiracion = flatpickr(inputExp, {
            locale:        _FP_LOCALE_ES,
            dateFormat:    'Y-m-d',
            minDate:       manana,
            maxDate:       maxFecha,
            disableMobile: true,
        });
    }
}
if (typeof flatpickr !== 'undefined') {
    initFlatpickrs();
} else {
    window.addEventListener('load', initFlatpickrs);
}

// ── Envío del formulario ──────────────────────────────────────────
btnEnviarNueva.addEventListener('click', async () => {
    errorNueva.style.display  = 'none';
    progressMsg.style.display = 'none';

    if (getTipoEnvio() === 'comunicado') {
        await enviarComunicado();
        return;
    }

    // Citación — siempre individual
    const cursoId     = selectCurso.value;
    const estudId     = selectEstud.value;
    const motivo      = document.getElementById('nuevaMotivo').value;
    const descripcion = document.getElementById('nuevaDescripcion').value.trim();
    const fechaLimite = document.getElementById('nuevaFechaLimite').value;

    if (!cursoId)     return mostrarError('Selecciona un curso.');
    if (!estudId)     return mostrarError('Selecciona un estudiante.');
    if (!motivo)      return mostrarError('Selecciona un motivo.');
    if (!descripcion) return mostrarError('Escribe una descripción.');
    if (!fechaLimite) return mostrarError('Selecciona la fecha límite.');

    btnEnviarNueva.disabled    = true;
    btnEnviarTexto.textContent = 'Enviando...';
    try {
        await crearIndividual(parseInt(estudId), motivo, descripcion, fechaLimite);
    } finally {
        btnEnviarNueva.disabled    = false;
        if (btnEnviarTexto.textContent === 'Enviando...')
            btnEnviarTexto.textContent = 'Enviar citación';
    }
});

function mostrarError(msg) {
    errorNueva.textContent     = msg;
    errorNueva.style.display   = 'block';
    btnEnviarNueva.disabled    = false;
    btnEnviarTexto.textContent = getTipoEnvio() === 'comunicado' ? 'Enviar comunicado' : 'Enviar citación';
}

// ── Crear comunicado con alcance ──────────────────────────────────
async function enviarComunicado() {
    const alcance   = getAlcance();
    const titulo    = document.getElementById('comTitulo').value.trim();
    const contenido = document.getElementById('comContenido').value.trim();
    const fechaExp  = document.getElementById('comFechaExpiracion').value || null;
    const grado     = document.getElementById('comGrado').value;
    const cursoId   = document.getElementById('comCurso').value;

    if (alcance === 'GRADO' && !grado)   return mostrarError('Selecciona el grado.');
    if (alcance === 'CURSO' && !cursoId) return mostrarError('Selecciona el curso.');
    if (!titulo)                         return mostrarError('Escribe un título para el comunicado.');
    if (!contenido)                      return mostrarError('Escribe el contenido del comunicado.');

    btnEnviarNueva.disabled    = true;
    btnEnviarTexto.textContent = 'Enviando...';

    const body = { titulo, contenido, alcance };
    if (fechaExp)            body.fecha_expiracion = fechaExp;
    if (alcance === 'GRADO') body.grado = grado;
    if (alcance === 'CURSO') body.curso = parseInt(cursoId);

    const alcanceLabel = { TODOS: 'todos los tutores', GRADO: `grado ${grado}`, CURSO: 'el curso seleccionado' };

    const { ok, data } = await fetchAPI('/api/comunicados/crear/', {
        method: 'POST',
        body:   JSON.stringify(body),
    });

    if (ok) {
        showAppToast('success', 'Comunicado enviado', `"${data.titulo}" fue enviado a ${alcanceLabel[alcance]}.`);
        resetForm();
        cargarCursosForm();
    } else {
        const msg = data?.errores || data?.titulo?.[0] || data?.contenido?.[0] || data?.curso?.[0] || 'Error al enviar el comunicado.';
        mostrarError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
}

// ── Crear citación individual ─────────────────────────────────────
async function crearIndividual(estudId, motivo, descripcion, fechaLimite) {
    const { ok, data } = await fetchAPI('/api/discipline/citaciones/crear/', {
        method: 'POST',
        body:   JSON.stringify({
            estudiante: estudId, motivo, descripcion,
            estado: 'ENVIADA', fecha_limite_asistencia: fechaLimite,
        }),
    });

    if (ok) {
        showAppToast('success', 'Citación creada', `Registrada para ${data.estudiante_nombre}.`);
        resetForm();
        await cargarCitaciones();
    } else {
        const msg = data?.errores || data?.estudiante?.[0] || 'Error al crear la citación.';
        mostrarError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
}

// ── Limpiar formulario ────────────────────────────────────────────
btnLimpiarForm.addEventListener('click', () => {
    resetForm();
    cargarCursosForm();
});

// ── Modal "Detalle citación" ──────────────────────────────────────
const modalDetalle        = document.getElementById('modalDetalleCitacion');
const modalDetalleConten  = document.getElementById('modalDetalleContenido');
const btnCerrarDetalle    = document.getElementById('btnCerrarDetalle');

function cerrarModalDetalle() {
    modalDetalle.classList.remove('visible');
}

btnCerrarDetalle.addEventListener('click', cerrarModalDetalle);
modalDetalle.addEventListener('click', e => { if (e.target === modalDetalle) cerrarModalDetalle(); });

async function abrirModalDetalle(id) {
    modalDetalleConten.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">Cargando...</p>';
    modalDetalle.classList.add('visible');

    const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${id}/`);
    if (!ok) {
        modalDetalleConten.innerHTML = '<p style="text-align:center;color:var(--error);padding:24px 0;">Error al cargar la citación.</p>';
        return;
    }

    const nombreEsc = data.estudiante_nombre.replace(/'/g, "\\'");
    const btnMarcar = (data.asistencia === 'PENDIENTE') ? `
        <div class="modal-det__footer">
            <button class="btn-marcar-asistencia"
                    style="width:100%;height:40px;border-radius:var(--radius-sm);font-size:.82rem;"
                    onclick="cerrarModalDetalle();abrirModalMarcar('${data.id}','${nombreEsc}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Marcar asistencia del tutor
            </button>
        </div>` : '';

    modalDetalleConten.innerHTML = `
        <div class="modal-det__hero modal-det__hero--${data.asistencia}">
            <p class="modal-det__nombre">${data.estudiante_nombre}</p>
            <div class="modal-det__sub">
                <span class="badge-curso">${data.curso}</span>
                <span class="citacion-card__motivo citacion-card__motivo--${data.motivo}">${MOTIVO_LABELS[data.motivo] || data.motivo}</span>
                ${estadoBadgeHTML(data.asistencia)}
            </div>
        </div>

        <div class="modal-det__body">
            <div class="modal-det__info-grid">
                <div class="modal-det__info-item">
                    <p class="modal-det__info-label">Emitido por</p>
                    <p class="modal-det__info-val">${data.emitido_por_nombre || '—'}</p>
                    ${data.emitido_por_cargo ? `<p style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">${data.emitido_por_cargo}</p>` : ''}
                </div>
                <div class="modal-det__info-item">
                    <p class="modal-det__info-label">Tutor registrado</p>
                    <p class="modal-det__info-val">${data.tutor_nombre || '<em style="color:var(--text-muted);font-weight:400;">Sin tutor</em>'}</p>
                </div>
            </div>

            <div class="modal-det__desc">
                <p class="modal-det__desc-label">Descripción</p>
                <p class="modal-det__desc-text">${data.motivo_descripcion || '—'}</p>
            </div>

            <div class="modal-det__dates">
                <div class="modal-det__date-item">
                    <span class="modal-det__date-label">Fecha de envío</span>
                    <span class="modal-det__date-val">${formatFecha(data.fecha_envio)}</span>
                </div>
                <div class="modal-det__date-item">
                    <span class="modal-det__date-label">Fecha límite</span>
                    <span class="modal-det__date-val">${formatFecha(data.fecha_limite_asistencia)}</span>
                </div>
            </div>
        </div>

        ${btnMarcar}
    `;
}

// ── Modal "Marcar asistencia" ─────────────────────────────────────
const modalMarcar     = document.getElementById('modalMarcarAsistencia');
const btnCancelarMar  = document.getElementById('btnCancelarMarcar');
const btnConfirmarMar = document.getElementById('btnConfirmarMarcar');
const marcarNombre    = document.getElementById('marcarNombreEstudiante');
let citacionIdActual  = null;

function abrirModalMarcar(id, nombre) {
    citacionIdActual            = id;
    marcarNombre.textContent    = nombre;
    btnConfirmarMar.disabled    = false;
    btnConfirmarMar.textContent = 'Confirmar asistencia';
    modalMarcar.classList.add('visible');
}

function cerrarModalMarcar() {
    modalMarcar.classList.remove('visible');
    citacionIdActual = null;
}

btnCancelarMar.addEventListener('click', cerrarModalMarcar);
modalMarcar.addEventListener('click', e => { if (e.target === modalMarcar) cerrarModalMarcar(); });

btnConfirmarMar.addEventListener('click', async () => {
    if (!citacionIdActual) return;
    btnConfirmarMar.disabled    = true;
    btnConfirmarMar.textContent = 'Guardando...';

    const { ok } = await fetchAPI(`/api/discipline/citaciones/${citacionIdActual}/`, {
        method: 'PATCH',
        body:   JSON.stringify({}),
    });

    if (ok) {
        cerrarModalMarcar();
        showAppToast('success', 'Asistencia registrada', 'La citación fue actualizada correctamente.');
        await cargarCitaciones();
    } else {
        btnConfirmarMar.disabled    = false;
        btnConfirmarMar.textContent = 'Confirmar asistencia';
    }
});

// ── Sidebar ───────────────────────────────────────────────────────
(function () {
    const sidebar  = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const btnMenu  = document.getElementById('btnMenu');
    const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
    let _timer;

    sidebar.addEventListener('mouseenter', () => {
        clearTimeout(_timer);
        if (isDesktop()) sidebar.classList.add('sidebar--expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
        if (isDesktop()) _timer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200);
    });
    document.addEventListener('mousemove', function _c(e) {
        document.removeEventListener('mousemove', _c);
        if (!isDesktop()) return;
        const r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
            sidebar.classList.add('sidebar--expanded');
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
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            const href = item.getAttribute('href');
            if (!href || href === '#') e.preventDefault();
        });
    });
})();

// ── Perfil & Logout ───────────────────────────────────────────────
(function () {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u) {
        document.getElementById('profileName').textContent =
            `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
        document.getElementById('profileRole').textContent = u.tipo_usuario || 'Administración';
    }
    document.getElementById('btnLogout').addEventListener('click', async () => {
        if (typeof logoutFCM === 'function') await logoutFCM();
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });
})();

// ── Tabs ───────────────────────────────────────────────────────────
const panelCitaciones  = document.getElementById('panelCitaciones');
const panelComunicados = document.getElementById('panelComunicados');
const badgeCitaciones  = document.getElementById('badgeCitaciones');
const badgeComunicados = document.getElementById('badgeComunicados');

document.querySelectorAll('.tab-switcher__btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const switcher = btn.closest('.tab-switcher');
        // Scroll instantáneo al tab switcher para que el cambio de altura no cause salto
        const top = switcher.getBoundingClientRect().top + window.scrollY - 20;
        window.scrollTo({ top, behavior: 'instant' });

        document.querySelectorAll('.tab-switcher__btn').forEach(b => b.classList.remove('tab-switcher__btn--active'));
        btn.classList.add('tab-switcher__btn--active');
        const tab = btn.dataset.tab;
        panelCitaciones.style.display  = tab === 'citaciones'  ? '' : 'none';
        panelComunicados.style.display = tab === 'comunicados' ? '' : 'none';
        if (tab === 'comunicados') cargarComunicados();
    });
});

// ── Comunicados: carga y render ────────────────────────────────────
const ALCANCE_LABELS = {
    TODOS:      'Todo el colegio',
    GRADO:      'Un grado',
    CURSO:      'Un curso',
    MIS_CURSOS: 'Mis cursos',
};

async function cargarComunicados() {
    const list = document.getElementById('comunicadosList');
    list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:.875rem;">Cargando comunicados...</div>`;
    const { ok, data } = await fetchAPI('/api/comunicados/');
    if (!ok) {
        list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);font-size:.875rem;">Error al cargar comunicados.</div>`;
        return;
    }
    badgeComunicados.textContent = data.length;
    if (!data.length) {
        list.innerHTML = `
            <div class="empty-cards">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.64 12 19.79 19.79 0 0 1 1.58 3.38 2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.34 6.34l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>No hay comunicados registrados</span>
            </div>`;
        document.getElementById('comFooter').textContent = '';
        return;
    }
    list.innerHTML = data.map(c => _renderComunicadoCard(c)).join('');
    document.getElementById('comFooter').textContent = `${data.length} comunicado${data.length !== 1 ? 's' : ''}`;
}

function _renderComunicadoCard(c) {
    const fecha    = c.fecha_envio ? new Date(c.fecha_envio).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const expira   = c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    const alcance  = c.alcance_display || ALCANCE_LABELS[c.alcance] || c.alcance;
    const destino  = c.curso_nombre ? c.curso_nombre : (c.grado ? `Grado ${c.grado}` : alcance);

    return `
        <div class="com-card">
            <div class="com-card__top">
                <div class="com-card__titulo">${c.titulo}</div>
                <span class="alcance-badge">${destino}</span>
            </div>
            <div class="com-card__contenido">${c.contenido}</div>
            <div class="com-card__footer">
                <span class="com-card__footer-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${fecha}
                </span>
                <span class="com-card__footer-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    ${c.emisor_nombre}
                </span>
                ${expira ? `<span class="com-card__footer-item" style="margin-left:auto;color:var(--warning);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Expira ${expira}
                </span>` : ''}
            </div>
        </div>`;
}

// ── Init ──────────────────────────────────────────────────────────
cargarCitaciones().then(() => {
    badgeCitaciones.textContent = todasCitaciones.length;
});
cargarCursosForm();
