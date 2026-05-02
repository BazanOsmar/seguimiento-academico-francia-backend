/* ================================================================
   comunicados.js — Citaciones (individual | curso | colegio)
   ================================================================ */

'use strict';

// ── Estado global ─────────────────────────────────────────────────
let todasCitaciones = [];
let todasComunicados = [];
let filtroActivo    = 'PENDIENTE';  // por defecto muestra pendientes
let filtroEmisor    = '';           // '' = todos los roles
let filtroSearchCit = '';
let filtroSearchCom = '';
let filtroEmisorCom = '';
let filtroEstadoCit = 'ACTIVO';
let filtroEstadoCom = 'ACTIVO';

// ── Estado mes ────────────────────────────────────────────────────
const _hoy        = new Date();
const _mesActual  = `${_hoy.getFullYear()}-${String(_hoy.getMonth() + 1).padStart(2, '0')}`;
const _anioActual = _hoy.getFullYear();
let   _citMes     = _mesActual;
let   _comMes     = _mesActual;

// ── Paginación ────────────────────────────────────────────────────
let _citPage = 1;
const _citPerPage = 15;
let _citFiltradasData = [];

let _comPage = 1;
const _comPerPage = 8;
let _comFiltradasData = [];

const renderPaginationHTML = (total, perPage, current) => {
    if (total <= perPage) return '';
    const pages = Math.ceil(total / perPage);
    let html = `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:6px; margin-top:6px;">`;
    for(let i=1; i<=pages; i++) {
        const bg = (i === current) ? 'var(--accent)' : 'transparent';
        const color = (i === current) ? '#fff' : 'var(--text-primary)';
        const border = (i === current) ? 'var(--accent)' : 'var(--border)';
        html += `<button class="-page-btn" data-p="${i}" style="border:1px solid ${border}; border-radius:6px; background:${bg}; color:${color}; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:600; font-size:0.75rem; transition:all 0.15s;">${i}</button>`;
    }
    html += `</div>`;
    return html;
};

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

function _escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _formatFechaCorta(iso) {
    if (!iso) return '—';
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return iso;
    const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function _parseFechaLocal(iso) {
    if (!iso) return null;
    const raw = String(iso).slice(0, 10);
    const parts = raw.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function _inicioHoy() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _claseLimiteAsistencia(c) {
    const limite = _parseFechaLocal(c.fecha_limite_asistencia);
    if (!limite) return 'neutral';

    const hoy = _inicioHoy();
    if (limite <= hoy) return 'danger';

    const creada = _parseFechaLocal(c.fecha_creacion || c.fecha_envio) || hoy;
    const total = limite - creada;
    if (total <= 0) return 'danger';

    const transcurrido = hoy - creada;
    if (transcurrido <= 0) return 'ok';
    return (transcurrido / total) >= 0.5 ? 'warn' : 'ok';
}

function _limiteAsistenciaHTML(c) {
    const cls = _claseLimiteAsistencia(c);
    return `<span class="cit-limit cit-limit--${cls}">${_escapeHtml(_formatFechaCorta(c.fecha_limite_asistencia))}</span>`;
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

// ── Lista tabla de citaciones ─────────────────────────────────────
const _STATUS_CFG = {
    PENDIENTE:  { cls: 'pendiente',  txt: 'Pendiente'  },
    ASISTIO:    { cls: 'asistio',    txt: 'Asistió'    },
    NO_ASISTIO: { cls: 'no_asistio', txt: 'No asistió' },
    ATRASO:     { cls: 'atraso',     txt: 'Atraso'     },
    ANULADA:    { cls: 'anulada',    txt: 'Anulada'    },
};

function renderCards(citaciones) {
    if (citaciones) _citFiltradasData = citaciones;
    const grid = document.getElementById('citacionesGrid');
    const footer = document.getElementById('gridFooter');

    if (!_citFiltradasData.length) {
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
                <p>Sin citaciones en este mes.</p>
            </div>`;
        footer.textContent = '';
        return;
    }

    const total = _citFiltradasData.length;
    const from = (_citPage - 1) * _citPerPage;
    const paginadas = _citFiltradasData.slice(from, from + _citPerPage);

    grid.innerHTML = `
        <div class="cit-table-wrap">
            <table class="cit-table">
                <thead>
                    <tr>
                        <th>Tipo usuario</th>
                        <th>Nombre emisor</th>
                        <th>Estudiante</th>
                        <th>Curso</th>
                        <th>Límite asistencia</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${paginadas.map(c => {
                        const st       = _STATUS_CFG[c.asistencia] || { cls: '', txt: c.asistencia || 'Sin estado' };
                        const anulada  = c.asistencia === 'ANULADA';
                        const rowStyle = anulada ? 'opacity:.42;' : '';
                        return `
                            <tr data-id="${_escapeHtml(c.id)}" style="${rowStyle}">
                                <td><span class="cit-table__type">${_escapeHtml(c.emisor_tipo || 'Sin tipo')}</span></td>
                                <td>
                                    <div class="cit-table__main">${_escapeHtml(c.emisor_nombre || 'Sin emisor')}</div>
                                    ${c.materia_nombre ? `<div class="cit-table__muted">${_escapeHtml(c.materia_nombre)}</div>` : ''}
                                </td>
                                <td>
                                    <div class="cit-table__main">${_escapeHtml(c.estudiante_nombre)}</div>
                                    <div class="cit-table__muted">${_escapeHtml(MOTIVO_LABELS[c.motivo] || c.motivo || 'Sin motivo')}</div>
                                </td>
                                <td>${_escapeHtml(c.curso)}</td>
                                <td>${_limiteAsistenciaHTML(c)}</td>
                                <td>
                                    <span class="cit-badge-status cit-badge-status--${st.cls}">
                                        <span class="cit-status-dot"></span>${_escapeHtml(st.txt)}
                                    </span>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    const footerInfo = `${total} citacion${total !== 1 ? 'es' : ''}`;
    const pgHTML = renderPaginationHTML(total, _citPerPage, _citPage);
    if (footer) footer.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; width:100%; gap:8px;"><span style="color:var(--text-muted); font-size:0.8rem;">${footerInfo}</span>${pgHTML}</div>`;
    footer?.querySelectorAll('.-page-btn').forEach(b => {
         b.addEventListener('click', (e) => {
             _citPage = parseInt(e.target.dataset.p);
             grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
             renderCards();
         });
    });

    grid.querySelectorAll('tbody tr[data-id]').forEach(row => {
        row.addEventListener('click', () => abrirModalDetalle(row.dataset.id));
    });
}

function mostrarSkeletonCards() {
    const grid = document.getElementById('citacionesGrid');
    grid.innerHTML = '<div class="empty-cards"><p>Cargando citaciones...</p></div>';
}

// ── Stats de citaciones ───────────────────────────────────────────
function _actualizarStats(citaciones) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const pendientes = citaciones.filter(c => c.asistencia === 'PENDIENTE').length;
    const vencidas   = citaciones.filter(c => {
        if (c.asistencia !== 'PENDIENTE') return false;
        const lim = new Date((c.fecha_limite_asistencia || '') + 'T00:00:00');
        return lim < hoy;
    }).length;
    const asistidas  = citaciones.filter(c => c.asistencia === 'ASISTIO').length;

    const elT = document.getElementById('statTodos');
    const elP = document.getElementById('statPendientes');
    const elV = document.getElementById('statVencidas');
    const elA = document.getElementById('statAsistidas');
    if (elT) elT.textContent = citaciones.length;
    if (elP) elP.textContent = pendientes;
    if (elV) elV.textContent = vencidas;
    if (elA) elA.textContent = asistidas;
}

// ── Carga de datos ─────────────────────────────────────────────────
async function cargarCitaciones() {
    mostrarSkeletonCards();
    const { ok, data } = await fetchAPI('/api/discipline/citaciones/');
    if (!ok) return;
    todasCitaciones = data;
    const pendientes = data.filter(c => c.asistencia === 'PENDIENTE').length;
    if (badgeCitaciones) badgeCitaciones.textContent = pendientes || data.length;
    _actualizarStats(data);
    aplicarFiltro();
}

function _fechaMes(c) {
    const f = c.fecha_creacion || c.fecha_envio || c.fecha_limite_asistencia;
    return f ? f.slice(0, 7) : '';
}

function aplicarFiltro() {
    let filtradas = todasCitaciones.filter(c => _fechaMes(c) === _citMes);

    const countEl = document.getElementById('citMesCount');
    if (countEl) {
        const total = filtradas.length;
        countEl.textContent = total
            ? `${total} citacion${total !== 1 ? 'es' : ''}`
            : 'Sin citaciones';
    }

    filtradas = filtradas.filter(c => {
        const anulada = c.asistencia === 'ANULADA';
        return filtroEstadoCit === 'ANULADA' ? anulada : !anulada;
    });

    if (filtroEstadoCit !== 'ANULADA' && filtroActivo === 'VENCIDA') {
        const hoyFiltro = new Date(); hoyFiltro.setHours(0, 0, 0, 0);
        filtradas = filtradas.filter(c => {
            if (c.asistencia !== 'PENDIENTE') return false;
            const lim = new Date((c.fecha_limite_asistencia || '') + 'T00:00:00');
            return lim < hoyFiltro;
        });
    } else if (filtroEstadoCit !== 'ANULADA' && filtroActivo) {
        filtradas = filtradas.filter(c => c.asistencia === filtroActivo);
    }

    if (filtroEmisor) filtradas = filtradas.filter(c => c.emisor_tipo === filtroEmisor);
    if (filtroSearchCit) {
        const q = filtroSearchCit.toLowerCase();
        filtradas = filtradas.filter(c =>
            (c.estudiante_nombre || '').toLowerCase().includes(q)
        );
    }

    filtradas = [...filtradas].sort((a, b) =>
        new Date(a.fecha_limite_asistencia) - new Date(b.fecha_limite_asistencia)
    );

    _citPage = 1;
    renderCards(filtradas);
}

// ── Navegador de mes ──────────────────────────────────────────────
function _actualizarNavMes() {
    const [y, m] = _citMes.split('-').map(Number);
    const fecha = new Date(y, m - 1, 1);
    const label = fecha.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
    const labelEl = document.getElementById('citMesLabel');
    if (labelEl) labelEl.textContent = label;

    const btnPrev = document.getElementById('btnMesPrev');
    const btnNext = document.getElementById('btnMesNext');
    if (!btnPrev || !btnNext) return;
    btnPrev.disabled = (y === _anioActual && m === 1);
    btnNext.disabled = (_citMes >= _mesActual);
}

document.getElementById('btnMesPrev')?.addEventListener('click', () => {
    const [y, m] = _citMes.split('-').map(Number);
    if (y === _anioActual && m === 1) return;
    const d = new Date(y, m - 2, 1);
    _citMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    _actualizarNavMes();
    aplicarFiltro();
});

document.getElementById('btnMesNext')?.addEventListener('click', () => {
    if (_citMes >= _mesActual) return;
    const [y, m] = _citMes.split('-').map(Number);
    const d = new Date(y, m, 1);
    _citMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    _actualizarNavMes();
    aplicarFiltro();
});

_actualizarNavMes();

// ── Chips estado ──────────────────────────────────────────────────
document.querySelectorAll('.chip-filtro:not(.chip-emisor)').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-filtro:not(.chip-emisor)').forEach(c => c.classList.remove('chip-filtro--active'));
        chip.classList.add('chip-filtro--active');
        filtroActivo = chip.dataset.filtro;
        aplicarFiltro();
    });
});

// ── Stats cards como filtros ──────────────────────────────────────
document.getElementById('statsRow').addEventListener('click', e => {
    const card = e.target.closest('.cit-stat-card[data-filter]');
    if (!card) return;
    // data-filter="" → TODOS (null interno); resto → valor de estado
    const filter = card.dataset.filter || null;
    filtroActivo = filter;
    document.querySelectorAll('.cit-stat-card').forEach(c => c.classList.remove('cit-stat-card--active'));
    card.classList.add('cit-stat-card--active');
    aplicarFiltro();
});

// ── Chips de rol ──────────────────────────────────────────────────
document.getElementById('rolChips')?.addEventListener('click', e => {
    const chip = e.target.closest('.rol-chip');
    if (!chip) return;
    document.getElementById('rolChips')?.querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
    chip.classList.add('rol-chip--active');
    filtroEmisor = chip.dataset.emisor;
    aplicarFiltro();
});

document.getElementById('estadoChipsCit')?.addEventListener('click', e => {
    const chip = e.target.closest('.rol-chip');
    if (!chip) return;
    document.getElementById('estadoChipsCit')?.querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
    chip.classList.add('rol-chip--active');
    filtroEstadoCit = chip.dataset.estado || 'ACTIVO';
    aplicarFiltro();
});

const rolChipsCom = document.getElementById('rolChipsCom');
if (rolChipsCom) {
    rolChipsCom.addEventListener('click', e => {
        const chip = e.target.closest('.rol-chip');
        if (!chip) return;
        rolChipsCom.querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
        chip.classList.add('rol-chip--active');
        filtroEmisorCom = chip.dataset.emisor;
        aplicarFiltroComunicados(true);
    });
}

const estadoChipsCom = document.getElementById('estadoChipsCom');
if (estadoChipsCom) {
    estadoChipsCom.addEventListener('click', e => {
        const chip = e.target.closest('.rol-chip');
        if (!chip) return;
        estadoChipsCom.querySelectorAll('.rol-chip').forEach(c => c.classList.remove('rol-chip--active'));
        chip.classList.add('rol-chip--active');
        filtroEstadoCom = chip.dataset.estado || 'ACTIVO';
        aplicarFiltroComunicados(true);
    });
}

// ── Búsqueda por texto ─────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', function () {
    const valor = this.value.trim();
    const enCitaciones = document.getElementById('secTitleCit').classList.contains('sec-title--active');
    if (enCitaciones) {
        filtroSearchCit = valor;
        aplicarFiltro();
    } else {
        filtroSearchCom = valor;
        aplicarFiltroComunicados(true);
    }
});

// ── Refs del formulario ────────────────────────────────────────────
const formNueva      = document.getElementById('formNuevaCitacion');
const selectCurso    = document.getElementById('nuevaCurso');
const selectEstud    = document.getElementById('nuevaEstudiante');
const radiosAlcance  = document.querySelectorAll('input[name="comAlcance"]');
const wrapComGrado   = document.getElementById('wrapComGrado');
const wrapComCurso   = document.getElementById('wrapComCurso');
const rowCursoEstud  = document.getElementById('rowCursoEstud');
const wrapCurso      = document.getElementById('wrapCurso');
const wrapEstudiante = document.getElementById('wrapEstudiante');
const wrapGrupo      = document.getElementById('wrapGrupo');
const grupoEstList   = document.getElementById('grupoEstList');
const grupoCount     = document.getElementById('grupoCount');
const progressMsg    = document.getElementById('progressMsg');
const errorNueva     = document.getElementById('errorNueva');
const btnEnviarNueva = document.getElementById('btnEnviarNueva');
const btnEnviarTexto = document.getElementById('btnEnviarTexto');
const btnLimpiarForm = document.getElementById('btnLimpiarForm');
const btnToggleCit   = document.getElementById('btnToggleCit');
const btnToggleCom   = document.getElementById('btnToggleCom');

let fpFechaLimite     = null;
let fpFechaExpiracion = null;
let _cursosCache      = [];
let _estudiantesIndividualData = []; // cache de estudiantes del select individual

// ── Modales de formulario ─────────────────────────────────────────
const modalNuevaCit = document.getElementById('modalNuevaCitacion');
const modalNuevaCom = document.getElementById('modalNuevoComunicado');

function abrirModalCit() {
    modalNuevaCit.classList.add('visible');
    btnToggleCit.classList.add('is-open');
}
function cerrarModalCit() {
    modalNuevaCit.classList.remove('visible');
    btnToggleCit.classList.remove('is-open');
    resetForm();
}
function abrirModalCom() {
    modalNuevaCom.classList.add('visible');
    btnToggleCom.classList.add('is-open');
    _actualizarCoberturaFCM();
}
function cerrarModalCom() {
    modalNuevaCom.classList.remove('visible');
    btnToggleCom.classList.remove('is-open');
    resetFormCom();
}

// Alias para compatibilidad con código existente que llama colapsarForm()
function colapsarForm() { cerrarModalCit(); cerrarModalCom(); }

btnToggleCit.addEventListener('click', () => {
    if (modalNuevaCit.classList.contains('visible')) cerrarModalCit();
    else abrirModalCit();
});
btnToggleCom.addEventListener('click', () => {
    if (modalNuevaCom.classList.contains('visible')) cerrarModalCom();
    else abrirModalCom();
});

document.getElementById('btnCerrarModalCit').addEventListener('click', cerrarModalCit);
document.getElementById('btnCerrarModalCom').addEventListener('click', cerrarModalCom);
modalNuevaCit.addEventListener('click', e => { if (e.target === modalNuevaCit) cerrarModalCit(); });
modalNuevaCom.addEventListener('click', e => { if (e.target === modalNuevaCom) cerrarModalCom(); });

function getAlcance() {
    return document.querySelector('input[name="comAlcance"]:checked').value;
}

// ── Cambio de alcance del comunicado ─────────────────────────────
radiosAlcance.forEach(r => {
    r.addEventListener('change', () => {
        const alcance = getAlcance();
        wrapComGrado.style.display = alcance === 'GRADO' ? '' : 'none';
        wrapComCurso.style.display = alcance === 'CURSO' ? '' : 'none';
        _actualizarCoberturaFCM();
    });
});

document.getElementById('comGrado').addEventListener('change', _actualizarCoberturaFCM);
document.getElementById('comCurso').addEventListener('change', _actualizarCoberturaFCM);

function resetForm() {
    formNueva.reset();
    if (fpFechaLimite) fpFechaLimite.clear();

    // Restaurar fila curso/estudiante
    rowCursoEstud.style.display  = '';
    wrapCurso.style.opacity      = '1';
    selectCurso.disabled         = false;

    // Limpiar estudiante (modo individual)
    selectEstud.innerHTML        = '<option value="">— Selecciona estudiante —</option>';
    selectEstud.disabled         = true;
    wrapEstudiante.style.opacity = '0.45';
    wrapEstudiante.style.display = '';
    _estudiantesIndividualData   = [];
    const infTutor = document.getElementById('infTutorIndiv');
    if (infTutor) infTutor.style.display = 'none';

    // Limpiar grupo (modo grupo) — ocultar panel
    if (wrapGrupo) wrapGrupo.style.display = 'none';
    _grupoSeleccionados = [];
    _todosEstudiantesCurso = [];
    _cacheCursos = {};
    _renderChips();
    const lbl = document.getElementById('btnSelectorLabel');
    if (lbl) lbl.textContent = 'Seleccionar estudiantes…';
    const btnAbrir = document.getElementById('btnAbrirSelectorEst');
    if (btnAbrir) btnAbrir.disabled = true;

    // Limpiar mensajes
    progressMsg.style.display = 'none';
    errorNueva.style.display  = 'none';

    // Restaurar botón
    btnEnviarNueva.disabled      = false;
    btnEnviarNueva.style.display = '';
    btnEnviarTexto.textContent   = 'Enviar citación';
    btnLimpiarForm.style.display = 'none';
}

function resetFormCom() {
    document.getElementById('formNuevoComunicado').reset();
    if (fpFechaExpiracion) fpFechaExpiracion.clear();
    if (wrapComGrado) wrapComGrado.style.display = 'none';
    if (wrapComCurso) wrapComCurso.style.display = 'none';
    const errEl = document.getElementById('errorNuevaCom');
    const progEl = document.getElementById('progressMsgCom');
    if (errEl)  errEl.style.display  = 'none';
    if (progEl) progEl.style.display = 'none';
    const btnEl = document.getElementById('btnEnviarCom');
    if (btnEl) { btnEl.disabled = false; }
    const txtEl = document.getElementById('btnEnviarComTexto');
    if (txtEl) txtEl.textContent = 'Enviar comunicado';
    // Ocultar pill de cobertura
    const wrap = document.getElementById('fcmCoberturaWrap');
    if (wrap) wrap.style.display = 'none';
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


// ── Tipo de citación: individual / curso / grupo ──────────────────
function _getTipoCitacion() {
    return document.querySelector('input[name="tipoCitacion"]:checked')?.value || 'individual';
}

// Estado del grupo seleccionado
let _grupoSeleccionados = []; // [{ id, nombre, cursoLabel }]
let _todosEstudiantesCurso = [];
let _cacheCursos = {}; // cursoId → [estudiantes]  (evita recargas)

document.querySelectorAll('input[name="tipoCitacion"]').forEach(r => {
    r.addEventListener('change', () => {
        const tipo = _getTipoCitacion();
        const cursoId = selectCurso.value;

        if (tipo === 'individual') {
            wrapEstudiante.style.display = '';
            wrapGrupo.style.display      = 'none';
            if (cursoId) _cargarEstudiantesIndividual(cursoId);
        } else { // grupo
            wrapEstudiante.style.display = 'none';
            wrapGrupo.style.display      = '';
        }
    });
});

// ── Cambio de curso → carga estudiantes ──────────────────────────
selectCurso.addEventListener('change', async () => {
    const cursoId = selectCurso.value;
    const tipo = _getTipoCitacion();

    // Reset selectores de modo individual
    selectEstud.innerHTML        = '<option value="">— Selecciona estudiante —</option>';
    selectEstud.disabled         = true;
    wrapEstudiante.style.opacity = '0.45';
    _estudiantesIndividualData   = [];
    const _infDiv = document.getElementById('infTutorIndiv');
    if (_infDiv) _infDiv.style.display = 'none';
    btnEnviarNueva.disabled = false;
    // No limpiar _grupoSeleccionados: el director puede seleccionar de varios cursos
    _todosEstudiantesCurso = [];

    // Habilitar/deshabilitar botón selector
    const btnAbrir = document.getElementById('btnAbrirSelectorEst');
    if (btnAbrir) btnAbrir.disabled = !cursoId;

    if (!cursoId) return;

    if (tipo === 'individual') {
        await _cargarEstudiantesIndividual(cursoId);
    }
    // Para curso y grupo, los estudiantes se cargarán cuando se abra el selector flotante
});

async function _cargarEstudiantesIndividual(cursoId) {
    selectEstud.innerHTML = '<option value="">Cargando...</option>';
    const { ok, data } = await fetchAPI(`/api/students/curso/${cursoId}/estudiantes/`);
    if (!ok || !data.length) {
        selectEstud.innerHTML = '<option value="">— Sin estudiantes —</option>';
        _estudiantesIndividualData = [];
        return;
    }
    _estudiantesIndividualData = data;
    selectEstud.innerHTML = '<option value="">— Selecciona estudiante —</option>'
        + data.map(e => {
            const nombre = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`;
            if (e.tiene_tutor) {
                return `<option value="${e.id}">${nombre}</option>`;
            }
            return `<option value="${e.id}" disabled style="color:#888">${nombre} — sin tutor</option>`;
        }).join('');
    selectEstud.disabled         = false;
    wrapEstudiante.style.opacity = '1';
}

function _actualizarInfoTutor(estudId) {
    const div = document.getElementById('infTutorIndiv');
    if (!div) return;

    if (!estudId) { div.style.display = 'none'; btnEnviarNueva.disabled = false; return; }

    const est = _estudiantesIndividualData.find(e => String(e.id) === String(estudId));
    if (!est) { div.style.display = 'none'; return; }

    if (!est.tiene_tutor) {
        div.innerHTML = `<div style="
            display:flex;align-items:center;gap:8px;
            padding:9px 13px;border-radius:8px;
            background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);
            font-size:.8rem;color:#f87171;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Este estudiante <strong>no tiene tutor registrado</strong> — no se puede enviar la citación.</span>
        </div>`;
        div.style.display = 'block';
        btnEnviarNueva.disabled = true;
    } else {
        const fcm = est.tutor_tiene_fcm;
        div.innerHTML = `<div style="
            display:flex;align-items:center;gap:8px;
            padding:9px 13px;border-radius:8px;
            background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);
            font-size:.8rem;color:#4ade80;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Tiene tutor registrado · ${fcm
                ? '<strong>Recibirá notificación push</strong>'
                : 'Sin notificación push <span style=\'opacity:.65;font-size:.75rem;\'>(tutor sin app)</span>'
            }</span>
        </div>`;
        div.style.display = 'block';
        btnEnviarNueva.disabled = false;
    }
}

// Listener: al seleccionar estudiante individual → mostrar info tutor
selectEstud.addEventListener('change', () => _actualizarInfoTutor(selectEstud.value));

// ── Panel flotante: Selector de estudiantes ───────────────────────
const panelSelector    = document.getElementById('panelSelectorEst');
const backdropSelector = document.getElementById('backdropSelectorEst');
const selectorEstList  = document.getElementById('selectorEstList');
const selectorContador = document.getElementById('selectorContador');
const btnConfirmar     = document.getElementById('btnConfirmarSelectorEst');
const btnToggleAll     = document.getElementById('btnSelectorToggleAll');
const selectorBuscar   = document.getElementById('selectorBuscar');

function _abrirSelectorEst() {
    panelSelector.style.display    = 'flex';
    backdropSelector.style.display = 'block';
    selectorBuscar.value = '';
    _renderSelectorList('');
    _actualizarContadorSelector();
}

function _cerrarSelectorEst() {
    panelSelector.style.display    = 'none';
    backdropSelector.style.display = 'none';
}

// Abrir al hacer click en el botón
document.getElementById('btnAbrirSelectorEst').addEventListener('click', async () => {
    const cursoId = selectCurso.value;
    if (!cursoId) return;

    const opt       = selectCurso.options[selectCurso.selectedIndex];
    const cursoLabel = opt ? opt.textContent.trim() : '';
    const lbl = document.getElementById('selectorCursoLabel');
    if (lbl) lbl.textContent = cursoLabel;

    // Usar cache si existe, si no cargar
    if (_cacheCursos[cursoId]) {
        _todosEstudiantesCurso = _cacheCursos[cursoId];
        _abrirSelectorEst();
    } else {
        selectorEstList.innerHTML = '<p style="padding:12px;font-size:.83rem;color:var(--text-muted);">Cargando…</p>';
        _abrirSelectorEst();
        const { ok, data } = await fetchAPI(`/api/students/curso/${cursoId}/estudiantes/`);
        _todosEstudiantesCurso = ok ? data.filter(e => e.activo !== false) : [];
        _cacheCursos[cursoId]  = _todosEstudiantesCurso;
    }
    _renderSelectorList('');
    _actualizarContadorSelector();
});

document.getElementById('btnCerrarSelectorEst').addEventListener('click', _cerrarSelectorEst);
backdropSelector.addEventListener('click', _cerrarSelectorEst);

// Búsqueda en tiempo real
selectorBuscar.addEventListener('input', () => _renderSelectorList(selectorBuscar.value));

// Seleccionar/Deseleccionar todos (filtrados del curso actual)
btnToggleAll.addEventListener('click', () => {
    const q = selectorBuscar.value.toLowerCase();
    const cursoLabel = document.getElementById('selectorCursoLabel')?.textContent || '';
    const filtrados = _todosEstudiantesCurso.filter(e => {
        if (!e.tiene_tutor) return false;
        const n = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`.toLowerCase();
        return !q || n.includes(q);
    });
    const todosIds = filtrados.map(e => e.id);
    const yaSeleccionadosTodos = todosIds.every(id => _grupoSeleccionados.some(s => s.id === id));

    if (yaSeleccionadosTodos) {
        _grupoSeleccionados = _grupoSeleccionados.filter(s => !todosIds.includes(s.id));
    } else {
        filtrados.forEach(e => {
            if (!_grupoSeleccionados.some(s => s.id === e.id)) {
                const nombre = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`;
                _grupoSeleccionados.push({ id: e.id, nombre, cursoLabel });
            }
        });
    }
    _renderSelectorList(selectorBuscar.value);
    _actualizarContadorSelector();
});

// Confirmar selección → renderizar chips en modal principal
btnConfirmar.addEventListener('click', () => {
    _renderChips();
    _cerrarSelectorEst();
    // Actualizar label del botón
    const lbl = document.getElementById('btnSelectorLabel');
    if (lbl) {
        lbl.textContent = _grupoSeleccionados.length > 0
            ? `${_grupoSeleccionados.length} estudiante${_grupoSeleccionados.length !== 1 ? 's' : ''} seleccionado${_grupoSeleccionados.length !== 1 ? 's' : ''} — Editar`
            : 'Seleccionar estudiantes…';
    }
});

function _renderSelectorList(q) {
    const ql = q.toLowerCase();
    const filtrados = _todosEstudiantesCurso.filter(e => {
        const n = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`.toLowerCase();
        return !ql || n.includes(ql);
    });

    if (!filtrados.length) {
        selectorEstList.innerHTML = '<p style="padding:12px;font-size:.83rem;color:var(--text-muted);">Sin resultados.</p>';
        return;
    }

    selectorEstList.innerHTML = filtrados.map(e => {
        const nombre  = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`;
        const checked = _grupoSeleccionados.some(s => s.id === e.id);
        const bgStyle = checked ? 'background:var(--accent-dim,rgba(59,130,246,.12));' : '';

        // Badge "Sin tutor" visible cuando no tiene tutor
        const badgeSinTutor = !e.tiene_tutor
            ? `<span title="Sin tutor registrado" style="
                font-size:.67rem;font-weight:700;letter-spacing:.02em;
                padding:2px 7px;border-radius:50px;white-space:nowrap;flex-shrink:0;
                background:rgba(245,158,11,.12);color:#f59e0b;
                border:1px solid rgba(245,158,11,.25);">
                Sin tutor
               </span>`
            : '';

        // Icono FCM (solo si tiene tutor)
        const iconFcm = e.tiene_tutor
            ? (e.tutor_tiene_fcm
                ? `<span title="Tutor con app instalada" style="display:flex;align-items:center;color:#22c55e;flex-shrink:0;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                   </span>`
                : `<span title="Tutor sin app instalada" style="display:flex;align-items:center;color:var(--text-muted);opacity:.5;flex-shrink:0;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                   </span>`)
            : '';

        const sinTutor = !e.tiene_tutor;
        const rowStyle = sinTutor
            ? 'opacity:.5;cursor:not-allowed;'
            : `cursor:pointer;${bgStyle}`;

        return `<label style="display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:6px;
                      font-size:.84rem;user-select:none;transition:background .1s;${rowStyle}"
                      class="_sel-item${sinTutor ? ' _sel-item--disabled' : ''}"
                      data-id="${e.id}" data-nombre="${nombre.replace(/"/g,'&quot;')}"
                      data-disabled="${sinTutor}">
            <input type="checkbox" value="${e.id}" ${checked ? 'checked' : ''} ${sinTutor ? 'disabled' : ''}
                style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;${sinTutor ? 'cursor:not-allowed;' : 'cursor:pointer;'}">
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nombre.replace(/</g,'&lt;')}</span>
            <span style="display:flex;align-items:center;gap:5px;">${badgeSinTutor}${iconFcm}</span>
        </label>`;
    }).join('');

    // Listeners de cada item
    const cursoLabel = document.getElementById('selectorCursoLabel')?.textContent || '';
    selectorEstList.querySelectorAll('._sel-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.dataset.disabled === 'true') return;
            setTimeout(() => {
                const cb     = item.querySelector('input');
                const id     = parseInt(item.dataset.id);
                const nombre = item.dataset.nombre;
                if (cb.checked) {
                    if (!_grupoSeleccionados.some(s => s.id === id))
                        _grupoSeleccionados.push({ id, nombre, cursoLabel });
                    item.style.background = 'var(--accent-dim,rgba(59,130,246,.12))';
                    item.style.color = 'var(--accent-text,#60a5fa)';
                } else {
                    _grupoSeleccionados = _grupoSeleccionados.filter(s => s.id !== id);
                    item.style.background = '';
                    item.style.color = '';
                }
                _actualizarContadorSelector();
            }, 0);
        });
    });

    // Actualizar texto del toggle-all según estado filtrado
    const todosIds = filtrados.map(e => e.id);
    const todosMarcados = todosIds.every(id => _grupoSeleccionados.some(s => s.id === id));
    btnToggleAll.textContent = (todosMarcados && todosIds.length > 0) ? 'Deseleccionar todos' : 'Seleccionar todos';
}

function _actualizarContadorSelector() {
    const n = _grupoSeleccionados.length;
    selectorContador.textContent = `${n} seleccionado${n !== 1 ? 's' : ''}`;
    btnConfirmar.style.opacity = n > 0 ? '1' : '.5';
}

function _renderChips() {
    const chips = document.getElementById('grupoChips');
    const badge = document.getElementById('grupoCountBadge');
    const lbl   = document.getElementById('btnSelectorLabel');
    if (!chips) return;

    const n = _grupoSeleccionados.length;

    // Badge de conteo junto al botón
    if (badge) {
        if (n > 0) {
            badge.style.display = '';
            badge.textContent   = `${n} seleccionado${n !== 1 ? 's' : ''}`;
        } else {
            badge.style.display = 'none';
        }
    }

    // Label del botón
    if (lbl) {
        lbl.textContent = n > 0 ? 'Editar selección' : 'Seleccionar estudiantes…';
    }

    // Lista compacta — vacía si no hay nadie
    if (!n) {
        chips.style.display = 'none';
        chips.innerHTML = '';
        return;
    }

    chips.style.display = 'flex';
    chips.innerHTML = _grupoSeleccionados.map((s, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:5px 8px;border-radius:6px;gap:8px;
                    background:${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.03)'};">
            <span style="display:flex;flex-direction:column;gap:1px;min-width:0;">
                <span style="font-size:.81rem;color:var(--text-primary);white-space:nowrap;
                             overflow:hidden;text-overflow:ellipsis;">
                    ${s.nombre.replace(/</g,'&lt;')}
                </span>
                ${s.cursoLabel ? `<span style="font-size:.7rem;color:var(--text-muted);">${s.cursoLabel.replace(/</g,'&lt;')}</span>` : ''}
            </span>
            <button type="button" data-id="${s.id}"
                style="flex-shrink:0;background:none;border:none;cursor:pointer;
                       color:var(--text-muted);display:flex;align-items:center;
                       padding:2px;border-radius:4px;transition:color .12s;"
                onmouseenter="this.style.color='var(--error,#ef4444)'"
                onmouseleave="this.style.color='var(--text-muted)'"
                title="Quitar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>`).join('');

    // Listeners botones ×
    chips.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id);
            _grupoSeleccionados = _grupoSeleccionados.filter(s => s.id !== id);
            _renderChips();
        });
    });
}


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

// ── Envío: citación ───────────────────────────────────────────────
btnEnviarNueva.addEventListener('click', async () => {
    errorNueva.style.display  = 'none';
    progressMsg.style.display = 'none';

    const tipo        = _getTipoCitacion();
    const cursoId     = selectCurso.value;
    const motivo      = document.getElementById('nuevaMotivo').value;
    const descripcion = document.getElementById('nuevaDescripcion').value.trim();
    const fechaLimite = document.getElementById('nuevaFechaLimite').value;

    if (!cursoId)     return mostrarError('Selecciona un curso.');
    if (!motivo)      return mostrarError('Selecciona un motivo.');
    if (!descripcion) return mostrarError('Escribe una descripción.');
    if (!fechaLimite) return mostrarError('Selecciona la fecha límite.');

    if (tipo === 'individual') {
        // ── Modo individual ───────────────────────────────────────
        const estudId = selectEstud.value;
        if (!estudId) return mostrarError('Selecciona un estudiante.');
        btnEnviarNueva.disabled    = true;
        btnEnviarTexto.textContent = 'Enviando…';
        try {
            await crearIndividual(parseInt(estudId), motivo, descripcion, fechaLimite);
        } finally {
            btnEnviarNueva.disabled    = false;
            if (btnEnviarTexto.textContent === 'Enviando…')
                btnEnviarTexto.textContent = 'Enviar citación';
        }

    } else {
        // ── Modo grupo ────────────────────────────────────────────
        const ids = _grupoSeleccionados.map(s => s.id);
        if (!ids.length) return mostrarError('Selecciona al menos un estudiante en el grupo.');

        btnEnviarNueva.disabled    = true;
        btnEnviarTexto.textContent = `Enviando ${ids.length} citaciones…`;

        let exitosos = 0, fallidos = 0;
        for (const estId of ids) {
            const { ok } = await fetchAPI('/api/discipline/citaciones/crear/', {
                method: 'POST',
                body:   JSON.stringify({ estudiante: estId, motivo, descripcion, estado: 'ENVIADA', fecha_limite_asistencia: fechaLimite }),
            });
            ok ? exitosos++ : fallidos++;
        }

        btnEnviarNueva.disabled    = false;
        btnEnviarTexto.textContent = 'Enviar citación';

        if (exitosos === 0) {
            mostrarError('No se pudo crear ninguna citación.');
        } else {
            const msg = `${exitosos} citación${exitosos !== 1 ? 'es' : ''} enviada${exitosos !== 1 ? 's' : ''} correctamente${fallidos > 0 ? ` (${fallidos} con error)` : ''}.`;
            showAppToast('success', 'Citaciones creadas', msg);
            resetForm();
            colapsarForm();
            await cargarCitaciones();
        }
    }
});

function mostrarError(msg) {
    errorNueva.textContent   = msg;
    errorNueva.style.display = 'block';
    btnEnviarNueva.disabled  = false;
    btnEnviarTexto.textContent = 'Enviar citación';
}

// ── Envío: comunicado ─────────────────────────────────────────────
const btnEnviarCom     = document.getElementById('btnEnviarCom');
const btnEnviarComText = document.getElementById('btnEnviarComTexto');

function mostrarErrorCom(msg) {
    const el = document.getElementById('errorNuevaCom');
    el.textContent   = msg;
    el.style.display = 'block';
    btnEnviarCom.disabled    = false;
    btnEnviarComText.textContent = 'Enviar comunicado';
}

btnEnviarCom.addEventListener('click', async () => {
    const errEl = document.getElementById('errorNuevaCom');
    errEl.style.display = 'none';

    const alcance   = getAlcance();
    const titulo    = document.getElementById('comTitulo').value.trim();
    const descripcion = document.getElementById('comContenido').value.trim();
    const fechaExp  = document.getElementById('comFechaExpiracion').value || null;
    const grado     = document.getElementById('comGrado').value;
    const cursoId   = document.getElementById('comCurso').value;

    if (alcance === 'GRADO' && !grado)   return mostrarErrorCom('Selecciona el grado.');
    if (alcance === 'CURSO' && !cursoId) return mostrarErrorCom('Selecciona el curso.');
    if (!titulo)                         return mostrarErrorCom('Escribe un título.');
    if (!descripcion)                    return mostrarErrorCom('Escribe el contenido.');

    btnEnviarCom.disabled    = true;
    btnEnviarComText.textContent = 'Enviando...';

    const body = { titulo, descripcion, alcance };
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
        resetFormCom();
        cargarCursosForm();
        colapsarForm();
        cargarComunicados();
    } else {
        const msg = data?.errores || data?.titulo?.[0] || data?.contenido?.[0] || data?.curso?.[0] || 'Error al enviar.';
        mostrarErrorCom(typeof msg === 'string' ? msg : JSON.stringify(msg));
        btnEnviarCom.disabled = false;
        btnEnviarComText.textContent = 'Enviar comunicado';
    }
});

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
        colapsarForm();
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

    const actUser   = JSON.parse(localStorage.getItem('user') || 'null');
    const tipoUser  = actUser?.tipo_usuario || '';
    const esEmisor  = (actUser && actUser.id === data.emisor_id);
    const yaResuelta = ['ASISTIO', 'ATRASO', 'ANULADA'].includes(data.asistencia);

    // Botón "Marcar asistencia": solo si PENDIENTE y es el emisor
    const btnMarcar = (data.asistencia === 'PENDIENTE' && esEmisor) ? `
            <button class="btn-marcar-asistencia"
                    style="flex:1;height:40px;border-radius:var(--radius-sm);font-size:.82rem;"
                    onclick="cerrarModalDetalle();abrirModalMarcar('${data.id}','${nombreEsc}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Marcar asistencia
            </button>` : '';

    // Botón "Anular": visible según rol
    const puedeAnular = !yaResuelta && (
        tipoUser === 'Director' ||
        (tipoUser === 'Regente'  && data.emitido_por_cargo === 'Regente') ||
        (tipoUser === 'Profesor' && esEmisor)
    );
    const btnAnular = puedeAnular ? `
            <button onclick="cerrarModalDetalle();abrirModalAnular('${data.id}','${nombreEsc}')"
                    style="flex:1;height:40px;border-radius:var(--radius-sm);font-size:.82rem;
                           background:rgba(239,68,68,.1);color:#ef4444;
                           border:1px solid rgba(239,68,68,.25);cursor:pointer;font-weight:600;
                           display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                Anular
            </button>` : '';

    const footerHTML = (btnMarcar || btnAnular) ? `
        <div class="modal-det__footer" style="display:flex;gap:8px;">
            ${btnMarcar}${btnAnular}
        </div>` : '';

    const estadoEnvioBadge = data.estado === 'VISTO'
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(34,197,94,.13);color:#22c55e;">&#10003; Visto</span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(148,163,184,.12);color:var(--text-muted);">Enviada</span>`;

    const esAnulada = data.asistencia === 'ANULADA';
    const bannerAnulada = esAnulada ? `
        <div style="display:flex;align-items:center;gap:7px;
                    padding:7px 14px;margin-bottom:2px;
                    background:rgba(239,68,68,.08);border-bottom:1px solid rgba(239,68,68,.18);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="#ef4444" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span style="font-size:.73rem;font-weight:600;letter-spacing:.04em;color:#ef4444;">
                Esta citación fue anulada
            </span>
        </div>` : '';

    const contentFilter = esAnulada ? 'style="filter:grayscale(.6) opacity(.75);"' : '';

    modalDetalleConten.innerHTML = `
        ${bannerAnulada}
        <div ${contentFilter}>
            <div class="modal-det__hero modal-det__hero--${data.asistencia}">
                <p class="modal-det__nombre">${data.estudiante_nombre}</p>
                <div class="modal-det__sub">
                    <span class="badge-curso">${data.curso}</span>
                    <span class="citacion-card__motivo citacion-card__motivo--${data.motivo}">${MOTIVO_LABELS[data.motivo] || data.motivo}</span>
                    ${estadoBadgeHTML(data.asistencia)}
                    ${estadoEnvioBadge}
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

            ${footerHTML}
        </div>
    `;
}

// ── Modal "Anular citación" ───────────────────────────────────────
const modalAnular       = document.getElementById('modalAnularCitacion');
const btnCancelarAnular = document.getElementById('btnCancelarAnular');
const btnConfirmarAnul  = document.getElementById('btnConfirmarAnular');
const anularNombre      = document.getElementById('anularNombreEstudiante');
const anularPassInput   = document.getElementById('anularPasswordInput');
const anularPassError   = document.getElementById('anularPasswordError');
let _anularCitId        = null;

function abrirModalAnular(id, nombre) {
    _anularCitId                 = id;
    anularNombre.textContent     = nombre;
    anularPassInput.value        = '';
    anularPassError.style.display = 'none';
    btnConfirmarAnul.disabled    = false;
    btnConfirmarAnul.textContent = 'Anular citación';
    modalAnular.classList.add('visible');
    setTimeout(() => anularPassInput.focus(), 100);
}

function cerrarModalAnular() {
    modalAnular.classList.remove('visible');
    _anularCitId = null;
    anularPassInput.value         = '';
    anularPassError.style.display = 'none';
}

btnCancelarAnular.addEventListener('click', cerrarModalAnular);
modalAnular.addEventListener('click', e => { if (e.target === modalAnular) cerrarModalAnular(); });

// Permitir confirmar con Enter desde el campo contraseña
anularPassInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnConfirmarAnul.click();
});

btnConfirmarAnul.addEventListener('click', async () => {
    if (!_anularCitId) return;

    const password = anularPassInput.value;
    if (!password) {
        anularPassError.textContent   = 'Ingresa tu contraseña.';
        anularPassError.style.display = 'block';
        anularPassInput.focus();
        return;
    }

    btnConfirmarAnul.disabled    = true;
    btnConfirmarAnul.textContent = 'Verificando...';
    anularPassError.style.display = 'none';

    // Paso 1: verificar contraseña
    const { ok: passOk, data: passData } = await fetchAPI('/api/auth/verificar-contrasena/', {
        method: 'POST',
        body:   JSON.stringify({ password }),
    });

    if (!passOk) {
        anularPassError.textContent   = passData?.errores || 'Contraseña incorrecta.';
        anularPassError.style.display = 'block';
        anularPassInput.value         = '';
        anularPassInput.focus();
        btnConfirmarAnul.disabled    = false;
        btnConfirmarAnul.textContent = 'Anular citación';
        return;
    }

    // Paso 2: anular la citación
    btnConfirmarAnul.textContent = 'Anulando...';
    const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${_anularCitId}/anular/`, {
        method: 'PATCH',
        body:   JSON.stringify({}),
    });

    if (ok) {
        cerrarModalAnular();
        showAppToast('success', 'Citación anulada', 'La citación fue anulada correctamente.');
        await cargarCitaciones();
    } else {
        const msg = data?.errores || 'Error al anular la citación.';
        anularPassError.textContent   = msg;
        anularPassError.style.display = 'block';
        btnConfirmarAnul.disabled    = false;
        btnConfirmarAnul.textContent = 'Anular citación';
    }
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
        document.getElementById('profileName').textContent = "Republica de Francia 'A'";
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

// ── Selector de sección (título grande) ───────────────────────────
const panelCitaciones  = document.getElementById('panelCitaciones');
const panelComunicados = document.getElementById('panelComunicados');
const badgeCitaciones  = document.getElementById('badgeCitaciones');
const badgeComunicados = document.getElementById('badgeComunicados');

function _cambiarSeccion(sec) {
    const esCit = sec === 'citaciones';
    const searchInput = document.getElementById('searchInput');
    document.getElementById('secTitleCit').classList.toggle('sec-title--active', esCit);
    document.getElementById('secTitleCom').classList.toggle('sec-title--active', !esCit);

    document.getElementById('statsRow').style.display       = esCit ? '' : 'none';
    document.getElementById('sectionCitCard').style.display = esCit ? '' : 'none';
    document.getElementById('sectionComCard').style.display = esCit ? 'none' : '';

    document.getElementById('btnToggleCit').style.display   = esCit ? '' : 'none';
    document.getElementById('btnToggleCom').style.display   = esCit ? 'none' : '';

    if (searchInput) {
        searchInput.placeholder = esCit
            ? 'Buscar por nombre del estudiante...'
            : 'Buscar por título del comunicado...';
        searchInput.value = esCit ? filtroSearchCit : filtroSearchCom;
    }

    if (!esCit) cargarComunicados();
}

document.getElementById('secTitleCit').addEventListener('click', () => _cambiarSeccion('citaciones'));
document.getElementById('secTitleCom').addEventListener('click', () => _cambiarSeccion('comunicados'));

// ── Comunicados: carga y render ────────────────────────────────────

async function cargarComunicados() {
    const list = document.getElementById('comunicadosList');
    list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:.875rem;">Cargando comunicados...</div>`;
    
    try {
        const { ok, data } = await fetchAPI('/api/comunicados/');
        if (!ok) {
            list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);font-size:.875rem;">Error al cargar comunicados.</div>`;
            return;
        }
        todasComunicados = data;
        if (badgeComunicados) badgeComunicados.textContent = data.length;
        aplicarFiltroComunicados();
    } catch (e) {
        console.error("Error inside cargarComunicados:", e);
        list.innerHTML = `<div style="padding:40px;text-align:center;color:red;font-size:0.8rem;">JS Crash: ${e.message}<br>${e.stack}</div>`;
    }
}

function aplicarFiltroComunicados(resetPage = false) {
    if (resetPage) _comPage = 1;
    const list = document.getElementById('comunicadosList');
    if (!todasComunicados || !Array.isArray(todasComunicados)) {
        list.innerHTML = `<div style="color:red">todasComunicados is not an array (type: ${typeof todasComunicados}).</div>`;
        return;
    }
    
    try {
        _comFiltradasData = todasComunicados.filter(c => {
            const d = c.fecha_creacion ? c.fecha_creacion.slice(0, 7) : '';
            if (d !== _comMes) return false;
            if (filtroEmisorCom && c.emisor_tipo !== filtroEmisorCom) return false;
            if ((c.estado || 'ACTIVO') !== filtroEstadoCom) return false;
            if (filtroSearchCom) {
                const q = filtroSearchCom.toLowerCase();
                const titulo = (c.titulo || '').toLowerCase();
                if (!titulo.includes(q)) return false;
            }
            return true;
        });

        if (!_comFiltradasData.length) {
            list.innerHTML = `
                <div class="empty-cards">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35">
                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
                        <path d="M8 9h8"/>
                        <path d="M8 13h5"/>
                    </svg>
                    <span>No hay comunicados para este mes</span>
                </div>`;
            const footer = document.getElementById('comFooter');
            if (footer) footer.textContent = '';
            return;
        }
        
        const total = _comFiltradasData.length;
        const from = (_comPage - 1) * _comPerPage;
        const paginadas = _comFiltradasData.slice(from, from + _comPerPage);
        
        list.innerHTML = _renderComunicadosTable(paginadas);
        list.querySelectorAll('tbody tr[data-id]').forEach(row => {
            row.addEventListener('click', () => abrirModalDetalleComunicado(row.dataset.id));
        });
        
        const footer = document.getElementById('comFooter');
        if (footer) {
            const footerInfo = `${total} comunicado${total !== 1 ? 's' : ''}`;
            const pgHTML = renderPaginationHTML(total, _comPerPage, _comPage);
            footer.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; width:100%; gap:8px;"><span style="color:var(--text-muted); font-size:0.8rem;">${footerInfo}</span>${pgHTML}</div>`;
            footer.querySelectorAll('.-page-btn').forEach(b => {
                 b.addEventListener('click', (e) => {
                     _comPage = parseInt(e.target.dataset.p);
                     const pan = document.getElementById('panelComunicados');
                     if(pan) pan.scrollIntoView({ behavior: 'smooth', block: 'start' });
                     aplicarFiltroComunicados(false);
                 });
            });
        }
    } catch (e) {
        console.error("Error inside aplicarFiltroComunicados:", e);
        list.innerHTML = `<div style="padding:40px;color:red;font-size:0.8rem;">JS Crash in render: ${e.message}<br>${e.stack}</div>`;
    }
}

// ── Navegación de mes comunicados ─────────────────────────────────
function _actualizarNavMesCom() {
    const [y, m] = _comMes.split('-').map(Number);
    const fecha = new Date(y, m - 1, 1);
    const label = fecha.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
    document.getElementById('comMesLabel').textContent = label;

    const btnPrev = document.getElementById('btnComMesPrev');
    const btnNext = document.getElementById('btnComMesNext');
    if (btnPrev) btnPrev.disabled = (y === _anioActual && m === 1);
    if (btnNext) btnNext.disabled = (_comMes >= _mesActual);
}

document.getElementById('btnComMesPrev')?.addEventListener('click', () => {
    const [y, m] = _comMes.split('-').map(Number);
    if (y === _anioActual && m === 1) return;
    const d = new Date(y, m - 2, 1);
    _comMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    _actualizarNavMesCom();
    aplicarFiltroComunicados(true);
});

document.getElementById('btnComMesNext')?.addEventListener('click', () => {
    if (_comMes >= _mesActual) return;
    const [y, m] = _comMes.split('-').map(Number);
    const d = new Date(y, m, 1);
    _comMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    _actualizarNavMesCom();
    aplicarFiltroComunicados(true);
});

// Inicializar nav mes al cargar
document.addEventListener('DOMContentLoaded', () => {
    _actualizarNavMes();
    _actualizarNavMesCom();
});

function _renderComunicadosTable(comunicados) {
    return `
        <div class="cit-table-wrap">
            <table class="cit-table com-table">
                <thead>
                    <tr>
                        <th>Tipo usuario</th>
                        <th>Nombre usuario</th>
                        <th>Titulo</th>
                        <th>Fecha expiracion</th>
                    </tr>
                </thead>
                <tbody>
                    ${comunicados.map(c => {
                        const anulado   = c.estado === 'ANULADO';
                        const rowStyle  = anulado ? 'opacity:.42;' : '';
                        const badgeExtra = anulado
                            ? `<span style="display:inline-block;font-size:.67rem;font-weight:700;padding:1px 7px;
                                border-radius:99px;background:rgba(239,68,68,.12);color:#ef4444;
                                border:1px solid rgba(239,68,68,.25);margin-left:6px;">Anulado</span>`
                            : '';
                        return `
                        <tr data-id="${_escapeHtml(c.id)}" style="${rowStyle}">
                            <td><span class="cit-table__type">${_escapeHtml(c.emisor_tipo || 'Sin tipo')}</span></td>
                            <td><div class="cit-table__main">${_escapeHtml(c.emisor_nombre || 'Sin usuario')}</div></td>
                            <td>
                                <div class="cit-table__main">${_escapeHtml(c.titulo || 'Sin titulo')}${badgeExtra}</div>
                                <div class="cit-table__muted">${_escapeHtml((c.descripcion || '').slice(0, 96))}${(c.descripcion || '').length > 96 ? '...' : ''}</div>
                            </td>
                            <td>${_escapeHtml(c.fecha_expiracion ? formatFecha(c.fecha_expiracion) : 'Sin expiración')}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function _comunicadoCursosHTML(c) {
    const cursos = Array.isArray(c.cursos) && c.cursos.length ? c.cursos : ['Todo el colegio'];
    return cursos.map(curso => `<span class="modal-det__course-chip">${_escapeHtml(curso)}</span>`).join('');
}

function abrirModalDetalleComunicado(id) {
    const data = todasComunicados.find(c => String(c.id) === String(id));
    if (!data) return;

    const alcance    = data.alcance || (Array.isArray(data.cursos) && data.cursos.length ? 'CURSO' : 'TODOS');
    const esAnulado  = data.estado === 'ANULADO';
    const actUser    = JSON.parse(localStorage.getItem('user') || 'null');
    const tipoUser   = actUser?.tipo_usuario || '';
    const esEmisor   = actUser && actUser.id === data.emisor_id;

    const vistoBadge = data.visto
        ? '<span class="estado-badge estado-badge--asistio">Leído</span>'
        : '<span class="estado-badge estado-badge--pendiente">Enviado</span>';

    // Botón anular: visible según rol (igual que citaciones)
    const puedeAnular = !esAnulado && (
        tipoUser === 'Director' ||
        (tipoUser === 'Regente'  && data.emisor_tipo === 'Regente') ||
        (tipoUser === 'Profesor' && esEmisor)
    );
    const tituloEsc = (data.titulo || '').replace(/'/g, "\\'");
    const btnAnularCom = puedeAnular ? `
        <div class="modal-det__footer">
            <button onclick="cerrarModalDetalle();abrirModalAnularComunicado('${data.id}','${tituloEsc}')"
                    style="width:100%;height:40px;border-radius:var(--radius-sm);font-size:.82rem;
                           background:rgba(239,68,68,.1);color:#ef4444;
                           border:1px solid rgba(239,68,68,.25);cursor:pointer;font-weight:600;
                           display:flex;align-items:center;justify-content:center;gap:6px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                Anular comunicado
            </button>
        </div>` : '';

    // Banner + filtro visual cuando está anulado
    const bannerAnulado = esAnulado ? `
        <div style="display:flex;align-items:center;gap:7px;padding:7px 14px;margin-bottom:2px;
                    background:rgba(239,68,68,.08);border-bottom:1px solid rgba(239,68,68,.18);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span style="font-size:.73rem;font-weight:600;letter-spacing:.04em;color:#ef4444;">
                Este comunicado fue anulado
            </span>
        </div>` : '';
    const contentFilter = esAnulado ? 'style="filter:grayscale(.6) opacity(.75);"' : '';

    modalDetalleConten.innerHTML = `
        ${bannerAnulado}
        <div ${contentFilter}>
            <div class="modal-det__hero modal-det__hero--COMUNICADO">
                <p class="modal-det__nombre">${_escapeHtml(data.titulo || 'Comunicado')}</p>
                <div class="modal-det__sub">
                    <span class="citacion-card__motivo citacion-card__motivo--REUNION">${_escapeHtml(alcance)}</span>
                    ${vistoBadge}
                </div>
            </div>

            <div class="modal-det__body">
                <div class="modal-det__info-grid">
                    <div class="modal-det__info-item">
                        <p class="modal-det__info-label">Tipo usuario</p>
                        <p class="modal-det__info-val">${_escapeHtml(data.emisor_tipo || 'Sin tipo')}</p>
                    </div>
                    <div class="modal-det__info-item">
                        <p class="modal-det__info-label">Nombre usuario</p>
                        <p class="modal-det__info-val">${_escapeHtml(data.emisor_nombre || 'Sin usuario')}</p>
                    </div>
                </div>

                <div class="modal-det__desc">
                    <p class="modal-det__desc-label">Contenido</p>
                    <p class="modal-det__desc-text">${_escapeHtml(data.descripcion || 'Sin contenido')}</p>
                </div>

                <div class="modal-det__dates">
                    <div class="modal-det__date-item">
                        <span class="modal-det__date-label">Fecha de creación</span>
                        <span class="modal-det__date-val">${formatFecha(data.fecha_creacion)}</span>
                    </div>
                    <div class="modal-det__date-item">
                        <span class="modal-det__date-label">Fecha expiración</span>
                        <span class="modal-det__date-val">${data.fecha_expiracion ? formatFecha(data.fecha_expiracion) : '—'}</span>
                    </div>
                </div>

                <div class="modal-det__courses">
                    <p class="modal-det__desc-label">Cursos enviados</p>
                    <div class="modal-det__course-list">${_comunicadoCursosHTML(data)}</div>
                </div>
            </div>

            ${btnAnularCom}
        </div>`;

    modalDetalle.classList.add('visible');
}

// ── Modal "Anular comunicado" ─────────────────────────────────────
const modalAnularCom      = document.getElementById('modalAnularComunicado');
const btnCancelarAnulCom  = document.getElementById('btnCancelarAnularCom');
const btnConfirmarAnulCom = document.getElementById('btnConfirmarAnularCom');
const anularComNombre     = document.getElementById('anularComNombre');
const anularComPassInput  = document.getElementById('anularComPassInput');
const anularComPassError  = document.getElementById('anularComPassError');
let _anularComId          = null;

function abrirModalAnularComunicado(id, titulo) {
    _anularComId                      = id;
    anularComNombre.textContent       = `"${titulo}"`;
    anularComPassInput.value          = '';
    anularComPassError.style.display  = 'none';
    btnConfirmarAnulCom.disabled      = false;
    btnConfirmarAnulCom.textContent   = 'Anular comunicado';
    modalAnularCom.classList.add('visible');
    setTimeout(() => anularComPassInput.focus(), 100);
}

function cerrarModalAnularComunicado() {
    modalAnularCom.classList.remove('visible');
    _anularComId                     = null;
    anularComPassInput.value         = '';
    anularComPassError.style.display = 'none';
}

btnCancelarAnulCom.addEventListener('click', cerrarModalAnularComunicado);
modalAnularCom.addEventListener('click', e => { if (e.target === modalAnularCom) cerrarModalAnularComunicado(); });
anularComPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnConfirmarAnulCom.click(); });

btnConfirmarAnulCom.addEventListener('click', async () => {
    if (!_anularComId) return;

    const password = anularComPassInput.value;
    if (!password) {
        anularComPassError.textContent   = 'Ingresa tu contraseña.';
        anularComPassError.style.display = 'block';
        anularComPassInput.focus();
        return;
    }

    btnConfirmarAnulCom.disabled    = true;
    btnConfirmarAnulCom.textContent = 'Verificando...';
    anularComPassError.style.display = 'none';

    const { ok: passOk, data: passData } = await fetchAPI('/api/auth/verificar-contrasena/', {
        method: 'POST',
        body:   JSON.stringify({ password }),
    });

    if (!passOk) {
        anularComPassError.textContent   = passData?.errores || 'Contraseña incorrecta.';
        anularComPassError.style.display = 'block';
        anularComPassInput.value         = '';
        anularComPassInput.focus();
        btnConfirmarAnulCom.disabled    = false;
        btnConfirmarAnulCom.textContent = 'Anular comunicado';
        return;
    }

    btnConfirmarAnulCom.textContent = 'Anulando...';
    const { ok, data } = await fetchAPI(`/api/comunicados/${_anularComId}/anular/`, {
        method: 'PATCH',
        body:   JSON.stringify({}),
    });

    if (ok) {
        cerrarModalAnularComunicado();
        showAppToast('success', 'Comunicado anulado', 'El comunicado fue anulado correctamente.');
        await cargarComunicados();
    } else {
        const msg = data?.errores || 'Error al anular el comunicado.';
        anularComPassError.textContent   = msg;
        anularComPassError.style.display = 'block';
        btnConfirmarAnulCom.disabled    = false;
        btnConfirmarAnulCom.textContent = 'Anular comunicado';
    }
});

// ── Cobertura FCM (cuántos padres recibirán notificación) ─────────
let _coberturaTimer = null;
let _coberturaCache = null; // última respuesta para el panel de detalle

async function _actualizarCoberturaFCM() {
    const wrap  = document.getElementById('fcmCoberturaWrap');
    const texto = document.getElementById('fcmCoberturaTexto');
    const btn   = document.getElementById('fcmCoberturaBtn');
    if (!wrap || !texto || !btn) return;

    const alcance  = getAlcance();
    const grado    = document.getElementById('comGrado').value;
    const cursoId  = document.getElementById('comCurso').value;

    // Para GRADO/CURSO esperar a que se seleccione el valor
    if (alcance === 'GRADO' && !grado)   { wrap.style.display = 'none'; return; }
    if (alcance === 'CURSO' && !cursoId) { wrap.style.display = 'none'; return; }

    // Debounce leve para no disparar en cada keystroke
    clearTimeout(_coberturaTimer);
    _coberturaTimer = setTimeout(async () => {
        wrap.style.display = '';
        texto.textContent  = 'Calculando…';
        btn.className      = 'fcm-cobertura-pill';

        const params = new URLSearchParams({ alcance });
        if (alcance === 'GRADO') params.set('grado', grado);
        if (alcance === 'CURSO') params.set('curso_id', cursoId);

        const { ok, data } = await fetchAPI(`/api/notifications/cobertura-comunicado/?${params}`);
        if (!ok) { wrap.style.display = 'none'; return; }

        _coberturaCache = { data, alcance, grado, cursoId };

        const { total, con_fcm } = data;

        if (total === 0) {
            texto.textContent = 'Sin padres registrados en este alcance';
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--none';
        } else if (con_fcm === 0) {
            texto.textContent = `Ningún padre recibirá la notificación (0 de ${total})`;
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--none';
        } else if (con_fcm < total) {
            texto.textContent = `${con_fcm} de ${total} padres recibirán la notificación — ver detalle`;
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--warn';
        } else {
            texto.textContent = `Los ${total} padres recibirán la notificación — ver detalle`;
            btn.className     = 'fcm-cobertura-pill fcm-cobertura-pill--ok';
        }
    }, 250);
}

function _renderPanelCobertura(query) {
    const list = document.getElementById('panelCoberturaList');
    if (!list || !_coberturaCache) return;

    const { data } = _coberturaCache;
    const { tutores } = data;
    const q = (query || '').toLowerCase().trim();

    // Filtrar por búsqueda (nombre padre o nombre/curso estudiante)
    const filtrados = q
        ? tutores.filter(t =>
            t.nombre.toLowerCase().includes(q) ||
            (t.estudiantes || []).some(e =>
                e.nombre.toLowerCase().includes(q) || e.curso.toLowerCase().includes(q)
            )
        )
        : tutores;

    if (filtrados.length === 0) {
        list.innerHTML = `<p class="cobertura-empty">Sin resultados para "${_escapeHtml(q)}".</p>`;
        return;
    }

    // Agrupar por curso (usando el primer estudiante de cada padre como referencia)
    const grupos = {};
    filtrados.forEach(t => {
        const hijos = t.estudiantes || [];
        // Un padre puede tener hijos en varios cursos — lo ponemos en cada grupo relevante
        const cursosDelPadre = hijos.length
            ? [...new Set(hijos.map(e => e.curso))]
            : ['Sin curso'];

        cursosDelPadre.forEach(curso => {
            if (!grupos[curso]) grupos[curso] = [];
            // Evitar duplicar el padre si ya está en este grupo
            if (!grupos[curso].find(x => x.id === t.id)) {
                grupos[curso].push(t);
            }
        });
    });

    const cursosOrdenados = Object.keys(grupos).sort();

    list.innerHTML = cursosOrdenados.map(curso => {
        const items     = grupos[curso];
        const conFcm    = items.filter(t => t.tiene_fcm).length;
        const total     = items.length;
        const badgeCls  = conFcm === 0 ? 'none' : conFcm < total ? 'warn' : 'ok';
        const badgeTxt  = `${conFcm}/${total} activos`;

        const itemsHtml = items.map(t => {
            // Solo mostrar hijos de este curso
            const hijosDelCurso = (t.estudiantes || []).filter(e => e.curso === curso || curso === 'Sin curso');
            const hijosHtml = hijosDelCurso.map(e =>
                `<span class="cobertura-item__hijo">${_escapeHtml(e.nombre)} <span class="cobertura-item__curso">${_escapeHtml(e.curso)}</span></span>`
            ).join('');
            return `
            <div class="cobertura-item">
                <span class="cobertura-item__dot cobertura-item__dot--${t.tiene_fcm ? 'si' : 'no'}"></span>
                <span class="cobertura-item__info">
                    <span class="cobertura-item__nombre">${_escapeHtml(t.nombre)}</span>
                    ${hijosHtml ? `<span class="cobertura-item__hijos">${hijosHtml}</span>` : ''}
                </span>
                <span class="cobertura-item__badge cobertura-item__badge--${t.tiene_fcm ? 'si' : 'no'}">
                    ${t.tiene_fcm ? 'Activo' : 'Sin app'}
                </span>
            </div>`;
        }).join('');

        return `
        <div class="cobertura-grupo cobertura-grupo--collapsed" data-curso="${_escapeHtml(curso)}">
            <div class="cobertura-grupo__header">
                <svg class="cobertura-grupo__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                <span class="cobertura-grupo__nombre">${_escapeHtml(curso)}</span>
                <span class="cobertura-grupo__badge cobertura-grupo__badge--${badgeCls}">${badgeTxt}</span>
            </div>
            <div class="cobertura-grupo__items">${itemsHtml}</div>
        </div>`;
    }).join('');

    // Colapsar/expandir al clicar cabecera de grupo
    list.querySelectorAll('.cobertura-grupo__header').forEach(hdr => {
        hdr.addEventListener('click', () => {
            hdr.closest('.cobertura-grupo').classList.toggle('cobertura-grupo--collapsed');
        });
    });
}

function _abrirPanelCobertura() {
    if (!_coberturaCache) return;
    const panel    = document.getElementById('panelCobertura');
    const backdrop = document.getElementById('backdropCobertura');
    const subtitle = document.getElementById('panelCoberturaSubtitle');
    const footer   = document.getElementById('panelCoberturaFooter');
    const buscar   = document.getElementById('coberturaBuscar');
    if (!panel) return;

    const { data, alcance, grado } = _coberturaCache;
    const { total, con_fcm, sin_fcm } = data;

    const alcanceLabel = { TODOS: 'Todo el colegio', GRADO: `Grado ${grado}`, CURSO: 'Curso seleccionado' };
    subtitle.textContent = alcanceLabel[alcance] || alcance;
    footer.textContent   = `${con_fcm} con notificación activa · ${sin_fcm} sin app · ${total} en total`;

    if (buscar) buscar.value = '';
    _renderPanelCobertura('');

    panel.style.display    = 'flex';
    backdrop.style.display = 'block';
    if (buscar) buscar.focus();
}

function _cerrarPanelCobertura() {
    const panel    = document.getElementById('panelCobertura');
    const backdrop = document.getElementById('backdropCobertura');
    if (panel)    panel.style.display    = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

// Listeners del panel de cobertura
document.getElementById('fcmCoberturaBtn').addEventListener('click', _abrirPanelCobertura);
document.getElementById('btnCerrarPanelCobertura').addEventListener('click', _cerrarPanelCobertura);
document.getElementById('backdropCobertura').addEventListener('click', _cerrarPanelCobertura);
document.getElementById('coberturaBuscar').addEventListener('input', e => {
    _renderPanelCobertura(e.target.value);
});

// ── Init ──────────────────────────────────────────────────────────
cargarCitaciones().then(() => {
    badgeCitaciones.textContent = todasCitaciones.length;
});
cargarCursosForm();
