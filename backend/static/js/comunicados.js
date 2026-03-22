/* ================================================================
   comunicados.js — Citaciones (individual | curso | colegio)
   ================================================================ */

'use strict';

// ── Estado global ─────────────────────────────────────────────────
let todasCitaciones = [];
let filtroActivo    = '';

// ── Helpers ───────────────────────────────────────────────────────
const MOTIVO_LABELS = {
    FALTAS:      'Faltas',
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
        PENDIENTE:   { cls: 'estado-badge--pendiente',   txt: 'Pendiente'   },
        VISTO:       { cls: 'estado-badge--visto',       txt: 'Visto'       },
        ASISTIO:     { cls: 'estado-badge--asistio',     txt: 'Asistió'     },
        NO_ASISTIO:  { cls: 'estado-badge--no_asistio',  txt: 'No asistió'  },
        ATRASO:      { cls: 'estado-badge--atraso',      txt: 'Atraso'      },
        Informativo: { cls: 'estado-badge--informativo', txt: 'Informativo' },
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
        <div class="citacion-card" data-status="${c.asistencia}">
            <div class="citacion-card__top">
                <div class="citacion-card__info">
                    <p class="citacion-card__nombre">${c.estudiante_nombre}</p>
                    <div class="citacion-card__meta">
                        <span class="badge-curso">${c.curso}</span>
                        <span class="citacion-card__motivo">${MOTIVO_LABELS[c.motivo] || c.motivo}</span>
                    </div>
                </div>
                ${estadoBadgeHTML(c.asistencia)}
            </div>

            <div class="citacion-card__dates">
                <div class="citacion-card__date-item">
                    <span class="citacion-card__date-label">Fecha límite</span>
                    <span class="citacion-card__date-val">${formatFecha(c.fecha_limite_asistencia)}</span>
                </div>
                <div class="citacion-card__date-item">
                    <span class="citacion-card__date-label">Asistencia</span>
                    <span class="citacion-card__date-val">${formatFecha(c.fecha_asistencia)}</span>
                </div>
            </div>

            ${(c.asistencia === 'PENDIENTE' || c.asistencia === 'VISTO') ? `
            <div class="citacion-card__footer">
                <button class="btn-marcar btn-secondary"
                        style="width:100%;justify-content:center;height:34px;font-size:.8rem;"
                        data-id="${c.id}"
                        data-nombre="${c.estudiante_nombre}">
                    Marcar asistencia del tutor
                </button>
            </div>` : ''}
        </div>
    `).join('');

    grid.querySelectorAll('.btn-marcar').forEach(btn => {
        btn.addEventListener('click', () => abrirModalMarcar(btn.dataset.id, btn.dataset.nombre));
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
    aplicarFiltro();
}

function aplicarFiltro() {
    const filtradas = filtroActivo
        ? todasCitaciones.filter(c => c.asistencia === filtroActivo)
        : todasCitaciones;
    renderCards(filtradas);
}

// ── Chips de filtro ───────────────────────────────────────────────
document.querySelectorAll('.chip-filtro').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-filtro').forEach(c => c.classList.remove('chip-filtro--active'));
        chip.classList.add('chip-filtro--active');
        filtroActivo = chip.dataset.filtro;
        aplicarFiltro();
    });
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
    await crearIndividual(parseInt(estudId), motivo, descripcion, fechaLimite);
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

// ── Init ──────────────────────────────────────────────────────────
cargarCitaciones();
cargarCursosForm();
