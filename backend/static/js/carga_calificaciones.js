'use strict';

// ── Parámetros de URL ─────────────────────────────────────────────
const _params    = new URLSearchParams(window.location.search);
const _pcId      = _params.get('pc_id')    || '';
const _materia   = _params.get('materia')  || '—';
const _curso     = _params.get('curso')    || '—';
const _mes       = _params.get('mes')      || '';
const _mesHasta  = _params.get('mes_hasta') || '';
const _modoParam = _params.get('modo')     || '';

// ── Estado interno ────────────────────────────────────────────────
let _archivo = null;
let _validacionEnCurso = false;
let _validationStepTimer = null;
let _draftToken = null;
let _confirmandoEnCurso = false;
let _lastResultado = null;
let _soloLectura = false;
let _mesLabel = '';
let _diferencias = null;   // { sin_cambios, nuevas, modificadas, nuevas_columnas }
let _modoAnterior = false; // toggle: false = Excel actual, true = datos anteriores

// ── Estado modo historial ─────────────────────────────────────────
let _modoHistorial     = false;
let _modHistorialMap   = new Map();
let _hayModHistorial   = false;
let _mostrandoOriginal = true;    // true = nota original del mes (default), false = nota actual

// ── Rol del usuario actual ────────────────────────────────────────
let _esDirector = false;

// ── Filtros de vista ──────────────────────────────────────────────
let _dimFilter   = null;   // null = todas | 'saber'|'hacer'|'ser' = solo esa
let _currentTrim = null;   // trimestre activo para preservarlo al cambiar filtro

// ── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    const user  = JSON.parse(localStorage.getItem('user') || 'null');
    if (!token || !user || !['Profesor', 'Director'].includes(user.tipo_usuario)) {
        window.location.replace('/login/');
        return;
    }
    _esDirector = user.tipo_usuario === 'Director';

    // Poblar metadatos
    document.getElementById('ccCurso').textContent   = _curso;
    document.getElementById('ccMateria').textContent = _materia;

    // Badge período
    const mesRef  = parseInt(_mesHasta || _mes, 10);
    const meses   = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    _mesLabel = (mesRef >= 1 && mesRef <= 12) ? meses[mesRef] : 'Período actual';
    const periodBadge = document.getElementById('ccPeriodBadge');
    const deptBadge   = document.getElementById('ccDeptBadge');
    if (periodBadge) periodBadge.textContent = _mesLabel.toUpperCase();
    if (deptBadge)   deptBadge.textContent   = _materia !== '—' ? _materia : 'Carga de notas';

    _initDragDrop();
    _initButtons();

    // Director: siempre modo historial (solo lectura, sin upload).
    if (_esDirector) {
        _modoHistorial = true;
        const loaderLabel = document.querySelector('#ccInitLoader .cc-init-loader__label');
        if (loaderLabel) loaderLabel.textContent = 'Cargando notas...';
        _cargarNotasHistorico();
    } else if (_modoParam === 'historial' && _pcId && _mesHasta) {
        _modoHistorial = true;
        _cargarNotasHistorico();
    } else if (_pcId && _mes) {
        // Siempre consultar el servidor — no confiar solo en el parámetro URL
        _verificarEstadoNotas();
    } else {
        _mostrarVistaUpload();
    }
});

// ── Modo lectura / verificación inicial ───────────────────────────
async function _verificarEstadoNotas() {
    // Usa fetch directo para que fetchAPI no dispare toasts automáticos.
    // Si falla por cualquier razón, se queda en la vista de carga por defecto.
    try {
        const token = localStorage.getItem('access_token');
        const res   = await fetch(
            `/api/academics/profesor/estado-notas/?pc_id=${encodeURIComponent(_pcId)}&mes=${encodeURIComponent(_mes)}`,
            { headers: { 'Authorization': `Bearer ${token}` } },
        );
        if (!res.ok) { _mostrarVistaUpload(); return; }
        const data = await res.json();
        if (data.ya_subidas) {
            _mostrarVistaLectura(data.headers_por_trim);
        } else {
            _mostrarVistaUpload();
        }
    } catch {
        _mostrarVistaUpload();
    }
}

// ── Modo historial: carga notas acumuladas hasta mes_hasta ────────
async function _cargarNotasHistorico() {
    const _fallback = () => _esDirector ? _mostrarVistaSinNotasDirector() : _mostrarVistaUpload();
    try {
        const token = localStorage.getItem('access_token');
        const res   = await fetch(
            `/api/academics/profesor/notas-historico/?pc_id=${encodeURIComponent(_pcId)}&mes_hasta=${encodeURIComponent(_mesHasta)}`,
            { headers: { 'Authorization': `Bearer ${token}` } },
        );
        if (!res.ok) { _fallback(); return; }
        const data = await res.json();

        if (!data.headers_por_trim || !Object.keys(data.headers_por_trim).length) {
            _fallback();
            return;
        }

        // Construir mapa de notas modificadas
        _hayModHistorial = data.hay_modificadas || false;
        _modHistorialMap.clear();
        (data.notas_modificadas || []).forEach(m => {
            // clave compatible con la renderización: "dimension-colIdx_estudianteId"
            const key = `${m.dimension}-${m.columna_idx}_${m.estudiante_id}`;
            _modHistorialMap.set(key, {
                nota_original: m.nota_original,
                nota_actual:   m.nota_actual,
                trimestre:     m.trimestre,
            });
        });

        _mostrarVistaLecturaHistorial(data.headers_por_trim);
    } catch {
        _fallback();
    }
}

function _mostrarVistaSinNotasDirector() {
    document.getElementById('ccInitLoader').style.display = 'none';
    document.getElementById('ccCard').style.display       = 'none';
    document.querySelector('.cc-title').style.display     = 'none';
    document.querySelector('.cc-meta').style.display      = 'none';

    const dashboard = document.getElementById('ccDashboard');
    dashboard.innerHTML = `
        <div style="padding:80px 20px;text-align:center;color:var(--text-muted);">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:.4;margin-bottom:14px;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p style="font-size:1rem;font-weight:600;color:var(--text-secondary);margin:0 0 6px;">
                Sin notas registradas
            </p>
            <p style="font-size:.85rem;margin:0;">
                Este profesor aún no ha cargado notas para el período seleccionado.
            </p>
        </div>`;
    dashboard.style.display = 'block';
}

function _mostrarVistaLecturaHistorial(headersPorTrim) {
    _soloLectura = true;
    document.getElementById('ccInitLoader').style.display = 'none';
    document.getElementById('ccCard').style.display       = 'none';
    document.querySelector('.cc-title').style.display     = 'none';
    document.querySelector('.cc-meta').style.display      = 'none';
    document.querySelector('.cc-body').classList.add('cc-body--readonly');

    const r = {
        metadatos: {
            headers_actividades: headersPorTrim,
            hoja_origen: Object.keys(headersPorTrim)[0] || '1TRIM',
            gestion: new Date().getFullYear(),
        },
    };
    _lastResultado = r;
    const dashboard = document.getElementById('ccDashboard');
    dashboard.innerHTML     = _renderSuccessDashboard(r, null, true);
    dashboard.style.display = 'block';
    _initTableScrollSync();
    _renderBotonEliminarSiDirector(parseInt(_mesHasta || _mes, 10));
}

function _mostrarVistaLectura(headersPorTrim) {
    _soloLectura = true;
    document.getElementById('ccInitLoader').style.display  = 'none';
    document.getElementById('ccCard').style.display        = 'none';
    document.querySelector('.cc-title').style.display = 'none';
    document.querySelector('.cc-meta').style.display  = 'none';
    document.querySelector('.cc-body').classList.add('cc-body--readonly');
    const r = {
        metadatos: {
            headers_actividades: headersPorTrim,
            hoja_origen: Object.keys(headersPorTrim)[0] || '1TRIM',
            gestion: new Date().getFullYear(),
        },
    };
    _lastResultado = r;
    const dashboard = document.getElementById('ccDashboard');
    dashboard.innerHTML     = _renderSuccessDashboard(r, null, true);
    dashboard.style.display = 'block';
    _initTableScrollSync();
}

function _mostrarVistaUpload() {
    _soloLectura = false;
    document.getElementById('ccInitLoader').style.display = 'none';
    document.getElementById('ccCard').style.display       = 'block';
    document.getElementById('ccDashboard').style.display  = 'none';
    document.querySelector('.cc-back-row').style.display = '';
    document.querySelector('.cc-title').style.display    = '';
    document.querySelector('.cc-meta').style.display     = '';
}

// ── Drag & Drop ───────────────────────────────────────────────────
function _initDragDrop() {
    const card  = document.getElementById('ccCard');
    const input = document.getElementById('excelInput');

    input.addEventListener('change', () => {
        if (_validacionEnCurso) return;
        if (input.files[0]) _setArchivo(input.files[0]);
    });

    card.addEventListener('dragover', e => {
        e.preventDefault();
        if (_validacionEnCurso) return;
        card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', e => {
        if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
    });
    card.addEventListener('drop', e => {
        e.preventDefault();
        if (_validacionEnCurso) return;
        card.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) _setArchivo(file);
    });
}

function _clearSelectedFileState() {
    _archivo = null;
    document.getElementById('ccCard').classList.remove('has-file');
    document.getElementById('excelInput').value = '';
    document.getElementById('ccFilenamePill').classList.remove('visible');
    document.getElementById('ccFilenameText').textContent = '';
    document.getElementById('ccDropTitle').textContent = 'Arrastra tu archivo Excel aquí';
    document.getElementById('ccDropSub').textContent = 'O haz clic para buscar en tu ordenador. Asegúrate de que el archivo siga el formato de la plantilla oficial para una validación exitosa.';
    document.getElementById('btnSelectFile').style.display = 'inline-flex';
    document.getElementById('btnValidar').style.display = 'none';
    document.getElementById('btnValidar').disabled = true;
}

function _initButtons() {
    document.getElementById('btnValidar').addEventListener('click', () => {
        if (_validacionEnCurso) return;
        _validarPlanilla();
    });

    // Dialog de confirmación de subida
    const dlg         = document.getElementById('dlgConfirmarSubida');
    const dlgCancelar = document.getElementById('dlgBtnCancelar');
    const dlgConfirm  = document.getElementById('dlgBtnConfirmar');
    const dlgCerrar   = document.getElementById('dlgBtnCerrar');

    dlgCancelar.addEventListener('click', () => dlg.close());
    dlgCerrar.addEventListener('click', () => {
        dlg.close();
        window.location.href = '/profesor/';
    });

    // Bloquear cierre con backdrop durante la carga
    dlg.addEventListener('click', (e) => {
        if (e.target === dlg && !_confirmandoEnCurso) dlg.close();
    });
    // Bloquear cierre con Escape durante la carga
    dlg.addEventListener('cancel', (e) => {
        if (_confirmandoEnCurso) e.preventDefault();
    });

    dlgConfirm.addEventListener('click', () => {
        _dlgSetPanel('loading');
        _confirmarPlanilla();
    });
}

function _dlgSetPanel(panel) {
    ['Confirm', 'Loading', 'Done'].forEach(p => {
        const el = document.getElementById('dlgPanel' + p);
        if (el) el.classList.toggle('dlg-panel--hidden', p.toLowerCase() !== panel);
    });
}

function _abrirDialogConfirmar() {
    const dlg = document.getElementById('dlgConfirmarSubida');
    if (!dlg) return;
    _dlgSetPanel('confirm');
    dlg.showModal();
}

function _setValidationBusy(isBusy) {
    _validacionEnCurso = isBusy;

    const card = document.getElementById('ccCard');
    const btnSelect = document.getElementById('btnSelectFile');
    const btnValidar = document.getElementById('btnValidar');
    const input = document.getElementById('excelInput');

    card.classList.toggle('is-busy', isBusy);
    btnSelect.disabled = isBusy;
    btnValidar.disabled = isBusy || !_archivo;
    input.disabled = isBusy;
}

function _showValidationModal() {
    const modal = document.getElementById('ccValidationModal');
    const step = document.getElementById('ccValidationStep');
    const steps = [
        'Preparando archivo...',
        'Subiendo archivo al servidor...',
        'Validando estructura de la planilla...',
        'Verificando estudiantes y actividades...',
        'Generando vista previa...',
    ];
    let index = 0;

    _hideValidationModal();
    _setValidationBusy(true);
    step.textContent = steps[0];
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');

    _validationStepTimer = window.setInterval(() => {
        index = (index + 1) % steps.length;
        step.textContent = steps[index];
    }, 1400);
}

function _hideValidationModal() {
    const modal = document.getElementById('ccValidationModal');
    if (_validationStepTimer) {
        window.clearInterval(_validationStepTimer);
        _validationStepTimer = null;
    }
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    _setValidationBusy(false);
}

function _hideInlineObservation() {
    const box = document.getElementById('ccInlineObservation');
    const text = document.getElementById('ccInlineObservationText');
    box.classList.remove('visible');
    text.textContent = '';
}

function _showInlineObservation(message) {
    const box  = document.getElementById('ccInlineObservation');
    const text = document.getElementById('ccInlineObservationText');
    text.innerHTML = _esc(message || 'Se detectó una observación en la planilla.');
    box.classList.add('visible');
    window.requestAnimationFrame(() => {
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function _showInlineObservationList(errores) {
    const box  = document.getElementById('ccInlineObservation');
    const text = document.getElementById('ccInlineObservationText');
    const items = errores.map(e => `<li style="margin-bottom:5px;">${_esc(e.mensaje)}</li>`).join('');
    text.innerHTML = `<ul style="margin:4px 0 0;padding-left:18px;">${items}</ul>`;
    box.classList.add('visible');
    window.requestAnimationFrame(() => {
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

// ── Selección de archivo ──────────────────────────────────────────
function _setArchivo(file) {
    if (_validacionEnCurso) return;
    _hideInlineObservation();

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
        showToast('La plantilla no cumple el formato requerido', 'warning');
        return;
    }

    _archivo = file;
    const card = document.getElementById('ccCard');
    card.classList.add('has-file');

    // Mostrar nombre del archivo
    document.getElementById('ccFilenameText').textContent = file.name;
    document.getElementById('ccFilenamePill').classList.add('visible');

    // Cambiar título y subtítulo
    document.getElementById('ccDropTitle').textContent = 'Archivo listo para validar';
    document.getElementById('ccDropSub').textContent   = 'Revisa que el archivo sea correcto antes de continuar.';

    // Cambiar botones
    document.getElementById('btnSelectFile').style.display = 'none';
    const btnVal = document.getElementById('btnValidar');
    btnVal.style.display = 'inline-flex';
    btnVal.disabled      = false;
}

function _resetUpload() {
    if (_validacionEnCurso) return;

    _draftToken = null;
    _hideInlineObservation();
    _clearSelectedFileState();
    document.getElementById('ccDropTitle').textContent = 'Arrastra tu archivo Excel aquí';
    document.getElementById('ccDropSub').textContent   = 'O haz clic para buscar en tu ordenador. Asegúrate de que el archivo siga el formato de la plantilla oficial para una validación exitosa.';
    document.getElementById('btnSelectFile').style.display = 'inline-flex';
    document.getElementById('btnValidar').style.display    = 'none';
    document.getElementById('btnValidar').disabled         = true;

    const dashboard = document.getElementById('ccDashboard');
    dashboard.innerHTML     = '';
    dashboard.style.display = 'none';
    document.getElementById('ccCard').style.display       = 'block';
    document.querySelector('.cc-title').style.display     = '';
    document.querySelector('.cc-meta').style.display      = '';
    document.querySelector('.cc-back-row').style.display  = '';
    _setValidationBusy(false);
}

// ── Validar planilla contra la API ────────────────────────────────
async function _validarPlanilla() {
    if (_validacionEnCurso) return;
    if (!_pcId) {
        showToast('No se encontró la asignación. Vuelve y selecciona el curso de nuevo.', 'error');
        return;
    }
    if (!_archivo) return;

    const btnVal  = document.getElementById('btnValidar');
    _hideInlineObservation();
    _showValidationModal();
    btnVal.textContent = 'Validando…';

    const formData = new FormData();
    formData.append('archivo', _archivo);
    formData.append('profesor_curso_id', _pcId);
    formData.append('mes', _mes);

    const token = localStorage.getItem('access_token');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);
    let ok, data;
    try {
        const res = await fetch('/api/academics/profesor/validar-planilla/', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
            signal: controller.signal,
        });
        ok = res.ok;
        if (res.status === 401) {
            window.location.href = '/login/';
            return;
        }
        try {
            data = await res.json();
        } catch {
            data = { mensaje: `Error del servidor (${res.status}). Intenta nuevamente.` };
            ok = false;
        }
    } catch (error) {
        ok   = false;
        data = { mensaje: error?.name === 'AbortError'
            ? 'La validación tardó demasiado. Intenta nuevamente.'
            : 'Error de conexión. Intenta nuevamente.' };
    }

    window.clearTimeout(timeoutId);
    btnVal.textContent = 'Validar Planilla';
    _hideValidationModal();

    // Sin campo es_valido → error de red o servidor (no-JSON, 500, etc.)
    if (data?.es_valido === undefined) {
        _clearSelectedFileState();
        _showInlineObservation(data?.mensaje || 'Error de conexión. Intenta nuevamente.');
        return;
    }
    if (!data.es_valido) {
        _clearSelectedFileState();
        if (data.errores_estudiantes?.length) {
            _showInlineObservationList(data.errores_estudiantes);
        } else if (data.errores_notas?.length) {
            _showInlineObservationList(data.errores_notas.map(m => ({ mensaje: m })));
        } else {
            _showInlineObservation(data.mensaje || 'Se detectó una observación en la planilla.');
        }
        return;
    }
    _draftToken = data.draft_token || null;
    _mostrarResultado(data);
}

// ── Mostrar resultado ─────────────────────────────────────────────
function _mostrarResultado(r) {
    _lastResultado = r;
    _diferencias   = r.diferencias || null;
    _modoAnterior  = false;
    _hideInlineObservation();
    document.getElementById('ccCard').style.display       = 'none';
    document.querySelector('.cc-title').style.display     = 'none';
    document.querySelector('.cc-meta').style.display      = 'none';
    document.querySelector('.cc-back-row').style.display  = 'none';
    const dashboard = document.getElementById('ccDashboard');
    dashboard.innerHTML     = _renderSuccessDashboard(r) || _renderSuccessDashboard(_buildMockResultado());
    dashboard.style.display = 'block';
    _initTableScrollSync();

    // Scroll suave hasta el dashboard (o hasta el cuadro de cambios si existe)
    requestAnimationFrame(() => {
        const target = dashboard.querySelector('[data-scroll-anchor]') || dashboard;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

// ── Render helpers ────────────────────────────────────────────────
function _renderEstudiantes(est) {
    const { activos = 0, inactivos = 0, no_encontrados = [], lista_estudiantes = [],
            total_excel = 0, total_bd = 0, curso_verificado } = est;

    const encontrados  = activos + inactivos;
    const hayProblemas = no_encontrados.length > 0;
    const allOk        = encontrados === total_excel && total_excel > 0;

    const badgeColor  = allOk ? '#22c55e' : '#ef4444';
    const badgeBg     = allOk ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)';
    const badgeBorder = allOk ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)';
    const badgeIcon   = allOk
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    const headerBadge = `<span style="display:inline-flex;align-items:center;gap:5px;font-size:.78rem;font-weight:700;
        padding:3px 10px;border-radius:99px;background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeColor};">
        ${badgeIcon} ${encontrados} / ${total_excel} estudiantes</span>`;

    const inactivosBadge = inactivos > 0
        ? `<span style="font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:99px;
            background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#ca8a04;">
            ${inactivos} inactivo${inactivos !== 1 ? 's' : ''}</span>` : '';

    const headerColor  = hayProblemas ? '#ef4444' : '#22c55e';
    const headerBg     = hayProblemas ? 'rgba(239,68,68,.07)' : 'rgba(34,197,94,.07)';
    const headerBorder = hayProblemas ? 'rgba(239,68,68,.15)' : 'rgba(34,197,94,.15)';
    const headerIcon   = hayProblemas
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${headerColor}" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${headerColor}" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`;
    const headerTitle  = hayProblemas
        ? `${no_encontrados.length} estudiante${no_encontrados.length !== 1 ? 's' : ''} no encontrado${no_encontrados.length !== 1 ? 's' : ''} en la BD`
        : 'Todos los estudiantes verificados';

    let listaHtml = '';
    if (lista_estudiantes.length > 0) {
        const filas = lista_estudiantes.map((e, i) => {
            const nro = String(i + 1).padStart(2, '0');
            if (!e.encontrado) {
                return `<tr style="background:rgba(239,68,68,.06);">
                    <td style="padding:5px 10px;font-size:.72rem;color:rgba(239,68,68,.6);">${nro}</td>
                    <td style="padding:5px 10px;font-size:.82rem;font-weight:600;color:#ef4444;">${_esc(e.nombre)}</td>
                    <td style="padding:5px 10px;text-align:right;">
                        <span style="font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;
                            background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.2);">NO ENCONTRADO</span>
                    </td></tr>`;
            }
            if (!e.activo) {
                return `<tr>
                    <td style="padding:5px 10px;font-size:.72rem;color:var(--text-muted);">${nro}</td>
                    <td style="padding:5px 10px;font-size:.82rem;color:var(--text-secondary);">${_esc(e.nombre)}</td>
                    <td style="padding:5px 10px;text-align:right;">
                        <span style="font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:4px;
                            background:rgba(245,158,11,.1);color:#ca8a04;border:1px solid rgba(245,158,11,.2);">INACTIVO</span>
                    </td></tr>`;
            }
            return `<tr>
                <td style="padding:5px 10px;font-size:.72rem;color:var(--text-muted);">${nro}</td>
                <td style="padding:5px 10px;font-size:.82rem;color:var(--text);">${_esc(e.nombre)}</td>
                <td></td></tr>`;
        }).join('');

        listaHtml = `
        <div style="margin-top:12px;border:1px solid var(--border-subtle);border-radius:8px;overflow:hidden;max-height:260px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--bg-hover);position:sticky;top:0;">
                        <th style="padding:6px 10px;font-size:.62rem;font-weight:700;color:var(--text-muted);text-align:left;text-transform:uppercase;letter-spacing:.07em;width:36px;">#</th>
                        <th style="padding:6px 10px;font-size:.62rem;font-weight:700;color:var(--text-muted);text-align:left;text-transform:uppercase;letter-spacing:.07em;">Estudiante</th>
                        <th style="padding:6px 10px;font-size:.62rem;font-weight:700;color:var(--text-muted);text-align:right;text-transform:uppercase;letter-spacing:.07em;">Estado</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;
    }

    return `
    <div style="margin-top:10px;border:1px solid ${headerBorder};border-radius:12px;overflow:hidden;">
        <div style="background:${headerBg};padding:11px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid ${headerBorder};flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">${headerIcon}
                <span style="font-weight:700;font-size:.85rem;color:${headerColor};">${headerTitle}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">${headerBadge}${inactivosBadge}</div>
        </div>
        <div style="padding:12px 16px;">
            ${hayProblemas ? `<p style="font-size:.8rem;color:var(--text-muted);margin:0 0 4px;">
                Verifica que los nombres del Excel coincidan con los registrados en el curso
                ${curso_verificado ? `<strong style="color:var(--text);">${_esc(curso_verificado)}</strong>` : ''}.
            </p>` : ''}
            ${listaHtml}
            <p style="font-size:.75rem;color:var(--text-muted);margin:8px 0 0;">
                Estudiantes en la BD del curso: <strong style="color:var(--text-secondary);">${total_bd}</strong>
            </p>
        </div>
    </div>`;
}

function _renderNotas(notas) {
    const trimestres = notas.trimestres || {};
    const orden  = ['1TRIM', '2TRIM', '3TRIM'];
    const labels = { '1TRIM': '1er Trimestre', '2TRIM': '2do Trimestre', '3TRIM': '3er Trimestre' };
    const uid    = 'nt' + Math.random().toString(36).slice(2, 7);

    // Determina cuál tab mostrar por defecto: el primero que tenga datos, o el primero
    const defaultTrim = orden.find(t => {
        const td = trimestres[t];
        return td && (td.saber.casilleros.length > 0 || td.hacer.casilleros.length > 0);
    }) || orden[0];

    const tabsHtml = orden.map(trim => {
        const td        = trimestres[trim];
        const tieneDatos = td && (td.saber.casilleros.length > 0 || td.hacer.casilleros.length > 0);
        const isActive  = trim === defaultTrim;
        const dot       = tieneDatos
            ? `<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;"></span>`
            : '';
        return `<button
            id="${uid}-tab-${trim}"
            onclick="_ccSwitchTrim('${uid}','${trim}')"
            style="flex:1;padding:8px 12px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,color .15s;
                   background:${isActive ? 'var(--accent)' : 'transparent'};
                   color:${isActive ? '#fff' : 'var(--text-secondary)'};">
            ${dot}${labels[trim]}
        </button>`;
    }).join('');

    const panelsHtml = orden.map(trim => {
        const td = trimestres[trim];
        if (!td) return `<div id="${uid}-panel-${trim}" style="display:none;"></div>`;

        const saberHtml  = _renderDim(td.saber, 'SABER', '#6366f1', 45);
        const hacerHtml  = _renderDim(td.hacer, 'HACER', '#0ea5e9', 40);
        const tieneDatos = td.saber.casilleros.length > 0 || td.hacer.casilleros.length > 0;
        const contenido  = tieneDatos
            ? `${saberHtml}${hacerHtml}`
            : `<p style="text-align:center;color:var(--text-muted);font-size:.85rem;padding:28px 0;">Sin notas registradas en este trimestre.</p>`;

        return `<div id="${uid}-panel-${trim}" style="display:${trim === defaultTrim ? 'block' : 'none'};">${contenido}</div>`;
    }).join('');

    return `
    <div style="margin-top:16px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:10px;background:var(--bg-hover);border-bottom:1px solid var(--border);display:flex;gap:6px;">
            ${tabsHtml}
        </div>
        <div>${panelsHtml}</div>
    </div>`;
}

function _ccSwitchTrim(uid, trim) {
    ['1TRIM','2TRIM','3TRIM'].forEach(t => {
        const tab   = document.getElementById(`${uid}-tab-${t}`);
        const panel = document.getElementById(`${uid}-panel-${t}`);
        const active = t === trim;
        if (tab) {
            tab.style.background = active ? 'var(--accent)' : 'transparent';
            tab.style.color      = active ? '#fff' : 'var(--text-secondary)';
        }
        if (panel) panel.style.display = active ? 'block' : 'none';
    });
}

function _renderDim(dim, titulo, color, maxPts) {
    if (!dim.casilleros.length) return '';

    const headers = dim.casilleros.map(c =>
        `<th style="min-width:80px;text-align:center;">${_esc(c)}</th>`
    ).join('');

    const filas = dim.datos.map(est => {
        const celdas = dim.casilleros.map(c => {
            const v = est.notas[c];
            const display = v !== null && v !== undefined
                ? Math.round(Number(v))
                : '<span style="color:var(--text-muted);">—</span>';
            return `<td style="text-align:center;font-variant-numeric:tabular-nums;">${display}</td>`;
        }).join('');
        const prom = est.promedio !== null && est.promedio !== undefined
            ? Math.round(Number(est.promedio))
            : null;
        const promColor = prom === null ? 'var(--text-muted)'
            : prom >= maxPts * 0.7 ? '#22c55e' : prom >= maxPts * 0.5 ? '#f59e0b' : '#ef4444';
        return `<tr>
            <td style="font-variant-numeric:tabular-nums;color:var(--text-muted);text-align:center;">${est.numero ?? ''}</td>
            <td style="white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${_esc(est.nombre)}</td>
            ${celdas}
            <td style="text-align:center;font-weight:700;color:${promColor};">${prom !== null ? prom : '—'}</td>
        </tr>`;
    }).join('');

    return `
    <div style="padding:14px 16px 0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="width:3px;height:16px;background:${color};border-radius:2px;display:inline-block;"></span>
            <span style="font-size:.8rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.06em;">${titulo} / ${maxPts} pts</span>
        </div>
    </div>
    <div style="overflow-x:auto;padding-bottom:14px;">
        <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
            <thead>
                <tr style="background:var(--bg-hover);">
                    <th style="padding:8px 10px;text-align:center;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">#</th>
                    <th style="padding:8px 10px;text-align:left;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;min-width:160px;">Estudiante</th>
                    ${headers.replace(/(<th)/g, '<th style="padding:8px 10px;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;"')}
                    <th style="padding:8px 10px;text-align:center;font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">Promedio</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
    </div>`;
}

function _ccSwitchDashboard(trim) {
    if (!_lastResultado) return;
    if (trim) _currentTrim = trim;
    const dashboard = document.getElementById('ccDashboard');
    if (!dashboard) return;
    dashboard.innerHTML = _renderSuccessDashboard(_lastResultado, _currentTrim, _soloLectura);
    _initTableScrollSync();
}

function _ccSwitchDim(dim) {
    _dimFilter = dim || null;
    _ccSwitchDashboard(_currentTrim);
}

function _rotHeaderHtml(titulo) {
    const raw = String(titulo || '').trim();
    const m = raw.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s*[-·]\s*(.*)/);
    if (m) {
        return `<em class="cc-rot-date">${_esc(m[1])}</em><strong class="cc-rot-title">${_esc(m[2].trim())}</strong>`;
    }
    return `<strong class="cc-rot-title">${_esc(raw)}</strong>`;
}

function _initTableScrollSync() {
    const tableScroll = document.querySelector('#ccDashboard .cc-success-table-scroll');
    if (tableScroll) {
        tableScroll.scrollLeft = 0;
        return;
    }

    const shell = document.querySelector('#ccDashboard .cc-success-table-shell');
    if (!shell) return;
    const headWrap = shell.querySelector('.cc-success-table-head-wrap');
    const ghost = shell.querySelector('.cc-success-ghost-scroll');
    const bodyWrap = shell.querySelector('.cc-success-table-body-wrap');
    const ghostTrack = ghost?.firstElementChild;
    if (!headWrap || !ghost || !bodyWrap || !ghostTrack) return;

    const updateGhostRange = () => {
        const verticalGutter = Math.max(0, bodyWrap.offsetWidth - bodyWrap.clientWidth);
        ghostTrack.style.width = `${bodyWrap.scrollWidth + verticalGutter}px`;
    };

    let syncing = false;
    const syncFromGhost = () => {
        if (syncing) return;
        syncing = true;
        bodyWrap.scrollLeft = Math.min(ghost.scrollLeft, bodyWrap.scrollWidth - bodyWrap.clientWidth);
        headWrap.scrollLeft = bodyWrap.scrollLeft;
        syncing = false;
    };
    const syncFromBody = () => {
        if (syncing) return;
        syncing = true;
        ghost.scrollLeft = bodyWrap.scrollLeft;
        headWrap.scrollLeft = bodyWrap.scrollLeft;
        syncing = false;
    };

    updateGhostRange();
    ghost.addEventListener('scroll', syncFromGhost);
    bodyWrap.addEventListener('scroll', syncFromBody);
    window.addEventListener('resize', updateGhostRange, { once: true });
}

function _toggleModoAnterior() {
    _modoAnterior = !_modoAnterior;
    const dashboard = document.getElementById('ccDashboard');
    if (!dashboard) return;
    dashboard.innerHTML = _renderSuccessDashboard(_lastResultado, null, _soloLectura);
    _initTableScrollSync();
}

function _toggleVistaHistorial() {
    _mostrandoOriginal = !_mostrandoOriginal;
    const dashboard = document.getElementById('ccDashboard');
    if (!dashboard) return;
    dashboard.innerHTML = _renderSuccessDashboard(_lastResultado, null, true);
    _initTableScrollSync();
    _renderBotonEliminarSiDirector(parseInt(_mesHasta || _mes, 10));
}

function _renderSuccessDashboard(r, activeTrim, soloLectura = false) {
    const meta = r.metadatos || {};
    const headersByTrim = meta.headers_actividades || {};
    const trimOrder = ['1TRIM', '2TRIM', '3TRIM'];
    const trimKey = activeTrim && headersByTrim[activeTrim]
        ? activeTrim
        : (meta.hoja_origen && headersByTrim[meta.hoja_origen])
            ? meta.hoja_origen
            : (trimOrder.find(key => headersByTrim[key]) || Object.keys(headersByTrim)[0]);

    if (!trimKey || !headersByTrim[trimKey]) return '';

    const trimData = headersByTrim[trimKey];

    // ── Diff helpers (solo cuando viene de una validación, no en modo lectura) ──
    const _trimNum = {'1TRIM': 1, '2TRIM': 2, '3TRIM': 3}[trimKey] || 1;
    const _modForTrim    = (!soloLectura && _diferencias?.modificadas    || []).filter(m => m.trimestre === _trimNum);
    const _nuevasForTrim = (!soloLectura && _diferencias?.nuevas_columnas || []).filter(c => c.trimestre === _trimNum);

    // modMap: "nro_cellKey" → entrada de modificadas
    const _modMap        = new Map();
    const _colTituloMap  = new Map(); // "dim-pos" → titulo_anterior (cuando el nombre cambió)
    _modForTrim.forEach(m => {
        const dimCols = trimData[m.dimension] || [];
        const pos = m.col_idx != null
            ? dimCols.findIndex(c => c.col === m.col_idx)
            : dimCols.findIndex(c => c.titulo === m.titulo);
        if (pos < 0) return;
        _modMap.set(`${m.estudiante_id}_${m.dimension}-${pos}`, m);
        if (m.titulo_cambiado && m.titulo_anterior && !_colTituloMap.has(`${m.dimension}-${pos}`)) {
            _colTituloMap.set(`${m.dimension}-${pos}`, m.titulo_anterior);
        }
    });

    // nuevasSet: cellKeys de columnas que no existían en Mongo
    const _nuevasSet = new Set();
    _nuevasForTrim.forEach(c => {
        const dimCols = trimData[c.dimension] || [];
        const pos = dimCols.findIndex(col => col.col === c.col_idx);
        if (pos >= 0) _nuevasSet.add(`${c.dimension}-${pos}`);
    });

    const _hayModificadas = _modForTrim.length > 0;

    const dimensionDefs = [
        { key: 'saber', label: 'HACER',  css: 'saber', short: 'Hacer' },
        { key: 'hacer', label: 'SABER',  css: 'hacer', short: 'Saber' },
        { key: 'ser',   label: 'SER',    css: 'ser',   short: 'Ser'   },
    ];

    const allDimensions = dimensionDefs
        .map(def => ({ ...def, columns: Array.isArray(trimData[def.key]) ? trimData[def.key] : [] }))
        .filter(def => def.columns.length);

    if (!allDimensions.length) return '';

    const displayDimensions = _dimFilter
        ? allDimensions.filter(d => d.key === _dimFilter)
        : allDimensions;

    const rowMap = new Map();
    const allCellKeys = [];

    allDimensions.forEach(dim => {
        dim.columns.forEach((col, index) => {
            const cellKey = `${dim.key}-${index}`;
            col.__cellKey = cellKey;
            allCellKeys.push(cellKey);

            (col.notas || []).forEach(nota => {
                const rowKey = `${nota.nro}|${nota.nombre}`;
                if (!rowMap.has(rowKey)) {
                    rowMap.set(rowKey, {
                        nro: nota.nro,
                        nombre: nota.nombre,
                        values: {},
                    });
                }
                rowMap.get(rowKey).values[cellKey] = Number(nota.nota);
            });
        });
    });

    const rows = Array.from(rowMap.values()).sort((a, b) => {
        const nroA = Number(a.nro) || 0;
        const nroB = Number(b.nro) || 0;
        return nroA - nroB || String(a.nombre).localeCompare(String(b.nombre));
    });

    if (!rows.length) return '';

    const rowSummaries = rows.map(row => {
        const values = allCellKeys
            .map(key => row.values[key])
            .filter(value => Number.isFinite(value));
        const dimPromedios = {};
        allDimensions.forEach(dim => {
            const dimVals = dim.columns
                .map(col => row.values[col.__cellKey])
                .filter(v => Number.isFinite(v));
            dimPromedios[dim.key] = _avg(dimVals);
        });
        const dimVals = Object.values(dimPromedios).filter(v => Number.isFinite(v));
        return {
            ...row,
            promedio: dimVals.length ? dimVals.reduce((a, b) => a + b, 0) : null,
            dimPromedios,
        };
    });

    const dimAverages = {};
    allDimensions.forEach(dim => {
        const values = [];
        dim.columns.forEach(col => {
            (col.notas || []).forEach(nota => {
                values.push(Number(nota.nota));
            });
        });
        dimAverages[dim.key] = _avg(values);
    });

    const overallAverage = _avg(rowSummaries.map(row => row.promedio));
    const riskCount = rowSummaries.filter(row => Number.isFinite(row.promedio) && row.promedio < 60).length;
    const totalPossible = rows.length * allCellKeys.length;
    const filledCount = rowSummaries.reduce((sum, row) => {
        return sum + allCellKeys.filter(key => Number.isFinite(row.values[key])).length;
    }, 0);
    const coverage = totalPossible ? (filledCount / totalPossible) * 100 : 0;
    const coverageLabel = coverage >= 95 ? 'Excelente' : coverage >= 80 ? 'Completo' : 'En proceso';
    const gestion = meta.gestion || new Date().getFullYear();

    const totalScoreCols = displayDimensions.reduce((sum, dim) => sum + dim.columns.length, 0);
    const tableWidth = 54 + 260 + totalScoreCols * 52 + displayDimensions.length * 60 + 80;
    const colgroup = `<colgroup>
        <col style="width:54px">
        <col style="width:260px">
        ${displayDimensions.map(dim => [
            ...dim.columns.map(() => '<col style="width:52px">'),
            '<col style="width:60px">',
        ].join('')).join('')}
        <col>
    </colgroup>`;
    const trimLabels = {
        '1TRIM': '1er Trimestre',
        '2TRIM': '2do Trimestre',
        '3TRIM': '3er Trimestre',
    };
    const trimLabel = trimLabels[trimKey] || trimKey;

    const _selectStyle = 'padding:6px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.2);background:var(--bg-input,#1a2535);color:var(--text-primary,#eff6ff);font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;outline:none;';
    const trimSelectHtml = `<select onchange="_ccSwitchDashboard(this.value)" style="${_selectStyle}">
        ${trimOrder.map(t => {
            const hasData = !!headersByTrim[t];
            return `<option value="${t}" ${t === trimKey ? 'selected' : ''} ${!hasData ? 'disabled' : ''}>${trimLabels[t]}</option>`;
        }).join('')}
    </select>`;
    const dimSelectHtml = `<select onchange="_ccSwitchDim(this.value)" style="${_selectStyle}">
        <option value="" ${!_dimFilter ? 'selected' : ''}>Todas las dimensiones</option>
        ${allDimensions.map(d => `<option value="${d.key}" ${_dimFilter === d.key ? 'selected' : ''}>${d.label}</option>`).join('')}
    </select>`;
    const trimTabsHtml = `${trimSelectHtml}${dimSelectHtml}`;

    const groupedHeaders = displayDimensions.map(dim => `
        <th class="cc-success-table__group cc-success-table__group--${dim.css}" colspan="${dim.columns.length + 1}">
            ${_esc(dim.label)}
        </th>
    `).join('');

    const rotatedHeaders = displayDimensions.map(dim => [
        ...dim.columns.map((col, colIdx) => {
            const ck          = `${dim.key}-${colIdx}`;
            const tituloViejo = _colTituloMap.get(ck);
            const thStyle     = tituloViejo ? ' style="background:#151e2d;box-shadow:inset 0 0 0 9999px rgba(245,158,11,.22);"' : '';
            let titleAttr, headerTitulo;
            if (tituloViejo) {
                if (_modoAnterior) {
                    titleAttr    = `title="Nuevo: ${_esc(col.titulo)}"`;
                    headerTitulo = tituloViejo;
                } else {
                    titleAttr    = `title="Antes: ${_esc(tituloViejo)}"`;
                    headerTitulo = col.titulo;
                }
            } else {
                titleAttr    = `title="${_esc(col.titulo || '')}"`;
                headerTitulo = col.titulo;
            }
            return `<th class="cc-success-table__head cc-success-table__head--rot" ${titleAttr}${thStyle}>
                <span>${_rotHeaderHtml(headerTitulo)}</span>
            </th>`;
        }),
        `<th class="cc-success-table__head cc-success-table__dim-prom">Prom.</th>`,
    ].join('')).join('');

    const tableRows = rowSummaries.map(row => {
        const scoreCells = displayDimensions.map(dim => {
            const cells = dim.columns.map(col => {
                const cellKey  = col.__cellKey;
                const value    = row.values[cellKey];
                const modEntry = _modMap.get(`${row.nro}_${cellKey}`);
                const esNueva  = _nuevasSet.has(cellKey);

                // ── Modo historial: celdas modificadas en rojo ──────────────
                if (_modoHistorial) {
                    const histKey = `${dim.key}-${col.col}_${row.nro}`;
                    const histEntry = _modHistorialMap.get(histKey);
                    if (histEntry) {
                        if (_mostrandoOriginal) {
                            const notaOrig = histEntry.nota_original;
                            const tooltip  = 'Esta nota fue modificada en un mes posterior';
                            return `<td class="cc-success-table__score cc-score--modificada"
                                        title="${_esc(tooltip)}"
                                        style="background:rgba(239,68,68,.13);color:#f87171;font-weight:700;cursor:help;">
                                        ${_fmt1(notaOrig)}
                                    </td>`;
                        } else {
                            return Number.isFinite(value)
                                ? `<td class="cc-success-table__score">${_fmt1(value)}</td>`
                                : `<td class="cc-success-table__score is-empty">-</td>`;
                        }
                    }
                    return Number.isFinite(value)
                        ? `<td class="cc-success-table__score">${_fmt1(value)}</td>`
                        : `<td class="cc-success-table__score is-empty">-</td>`;
                }

                // ── Modo validación: diff con Excel anterior ──────────────
                if (_modoAnterior) {
                    if (modEntry) {
                        return `<td class="cc-success-table__score" style="background:rgba(245,158,11,.13);color:#b45309;font-weight:700;">${_fmt1(modEntry.nota_anterior)}</td>`;
                    }
                    if (esNueva) {
                        return `<td class="cc-success-table__score" style="color:var(--text-muted);font-style:italic;letter-spacing:.02em;">—</td>`;
                    }
                    return Number.isFinite(value)
                        ? `<td class="cc-success-table__score" style="color:var(--text-muted);">${_fmt1(value)}</td>`
                        : `<td class="cc-success-table__score is-empty">-</td>`;
                }

                // Vista "Excel actual" (default)
                if (modEntry) {
                    return Number.isFinite(value)
                        ? `<td class="cc-success-table__score" style="background:rgba(99,102,241,.12);color:var(--accent);font-weight:700;">${_fmt1(value)}</td>`
                        : `<td class="cc-success-table__score is-empty">-</td>`;
                }
                return Number.isFinite(value)
                    ? `<td class="cc-success-table__score">${_fmt1(value)}</td>`
                    : `<td class="cc-success-table__score is-empty">-</td>`;
            }).join('');

            const dimProm = row.dimPromedios[dim.key];
            const dimPromCell = `<td class="cc-success-table__dim-prom">${_fmt1(dimProm)}</td>`;
            return cells + dimPromCell;
        }).join('');

        return `
            <tr>
                <td class="cc-success-table__nro">${String(row.nro).padStart(2, '0')}</td>
                <td class="cc-success-table__name">${_esc(row.nombre)}</td>
                ${scoreCells}
                <td class="cc-success-table__avg">${_fmt1(row.promedio)}</td>
            </tr>
        `;
    }).join('');

    const dimFooter = displayDimensions.map(dim => `
        <div class="cc-success-dim">
            <span class="cc-success-dim-bar cc-success-dim-bar--${dim.css}"></span>
            <span>${_esc(dim.short)} Promedio: ${_fmt1(dimAverages[dim.key])}</span>
        </div>
    `).join('');

    const headTitle = soloLectura
        ? `<span style="font-size:2rem;font-weight:800;letter-spacing:-.02em;">Calificaciones - ${_esc(_mesLabel)}</span>`
        : `Registro de Notas - ${_esc(_materia)} - ${_esc(_curso)}`;

    // Barra de acciones: ancho completo, botones a la izquierda, tabs a la derecha
    const _backHref  = _esDirector ? '/director/academico/' : '/profesor/';
    const _backLabel = _esDirector ? 'Académico' : 'Calificaciones';
    const _backBtn   = `<button class="cc-success-tool" type="button" onclick="window.location.href='${_backHref}'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
        </svg>
        ${_backLabel}
    </button>`;

    const actionBarHtml = soloLectura
        ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:0 20px 18px;">
               ${_backBtn}
               <span class="cc-readonly-badge">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="20 6 9 17 4 12"/>
                   </svg>
                   Notas subidas
               </span>
               ${_modoHistorial && _hayModHistorial ? (() => {
                   const mesesNombre = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                                        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
                   const mesNum = parseInt(_mesHasta || _mes, 10);
                   const mesLbl = (mesNum >= 1 && mesNum <= 12) ? mesesNombre[mesNum] : 'el mes';
                   const textoBtn  = _mostrandoOriginal
                       ? 'Ver nota actual'
                       : `Ver nota de ${mesLbl}`;
                   // ↑ Si _mostrandoOriginal=true (default → nota original del mes con rojo),
                   //   el botón ofrece pasar a la nota actual.
                   //   Si _mostrandoOriginal=false (estás viendo la nota actual), el botón
                   //   ofrece volver a la nota original del mes.
                   return `
               <button class="cc-success-tool" type="button" onclick="_toggleVistaHistorial()"
                   style="border-color:rgba(96,165,250,.4);color:#60a5fa;">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                        stroke-linecap="round" stroke-linejoin="round">
                       <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                       <circle cx="12" cy="12" r="3"/>
                   </svg>
                   ${textoBtn}
               </button>`;
               })() : ''}
               <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
                   ${trimTabsHtml}
               </div>
           </div>`
        : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:0 20px 18px;">
               <button class="cc-success-tool" type="button" onclick="_resetUpload()">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="15 18 9 12 15 6"></polyline>
                   </svg>
                   Cambiar archivo
               </button>
               <button class="cc-success-tool cc-success-tool--primary" id="btnConfirmar" type="button" onclick="_abrirDialogConfirmar()">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="20 6 9 17 4 12"></polyline>
                   </svg>
                   Confirmar y subir notas
               </button>
               <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
                   ${trimTabsHtml}
               </div>
           </div>`;

    return `
        <div class="cc-success-report" data-scroll-anchor>
            <div class="cc-success-head">
                <div>
                    <h2 class="cc-success-title">${headTitle}</h2>
                    ${soloLectura ? `
                    <p class="cc-success-sub">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span style="font-size:1.05rem;">${_esc(_curso)} · ${_esc(_materia)}</span>
                    </p>` : ''}
                </div>
            </div>

            ${actionBarHtml}

            ${_hayModificadas ? `
            <div data-scroll-anchor style="margin:0 20px 18px;padding:14px 18px;border-radius:10px;
                        background:rgba(245,158,11,.13);border:1px solid rgba(245,158,11,.35);
                        display:flex;align-items:flex-start;gap:14px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div style="flex:1;min-width:0;">
                    <p style="margin:0 0 4px;font-weight:700;color:#fbbf24;font-size:.92rem;">
                        ${_modForTrim.length} nota${_modForTrim.length !== 1 ? 's' : ''} modificada${_modForTrim.length !== 1 ? 's' : ''} respecto a la carga anterior
                    </p>
                    <p style="margin:0 0 10px;font-size:.8rem;color:#fde68a;">
                        Las celdas resaltadas en
                        <span style="color:var(--accent);font-weight:600;">azul</span>
                        son las notas corregidas. Revisa los cambios antes de confirmar.
                    </p>
                    <button
                        onclick="_toggleModoAnterior()"
                        style="display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:8px;
                               border:1px solid ${_modoAnterior ? 'rgba(251,191,36,.5)' : 'rgba(251,191,36,.3)'};
                               background:${_modoAnterior ? 'rgba(251,191,36,.15)' : 'rgba(251,191,36,.08)'};
                               color:#fbbf24;
                               font-family:inherit;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                             stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
                        </svg>
                        ${_modoAnterior ? 'Ver Excel actual' : 'Ver datos anteriores'}
                    </button>
                    ${_modoAnterior ? `<span style="display:inline-block;margin-left:10px;font-size:.76rem;color:#fde68a;">
                        Valores en <strong style="color:#fcd34d;">naranja</strong> = lo que había antes · <em>—</em> = nota nueva
                    </span>` : ''}
                </div>
            </div>` : ''}

            <div class="cc-success-table-shell">
                <div class="cc-success-table-scroll">
                    <table class="cc-success-table" style="table-layout:fixed;width:100%;min-width:${tableWidth}px;">
                        ${colgroup}
                        <thead>
                            <tr>
                                <th class="cc-success-table__head cc-success-table__head--fixed cc-success-table__nro" rowspan="2">Nro</th>
                                <th class="cc-success-table__head cc-success-table__head--fixed cc-success-table__name" rowspan="2">Nombre Completo</th>
                                ${groupedHeaders}
                                <th class="cc-success-table__head cc-success-table__head--fixed cc-success-table__avg" rowspan="2">Promedio</th>
                            </tr>
                            <tr>${rotatedHeaders}</tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                <div class="cc-success-footer">
                    <div class="cc-success-dim-averages">${dimFooter}</div>
                    <div class="cc-success-footnote">Mostrando ${rows.length} de ${rows.length} estudiantes</div>
                </div>
            </div>

        </div>
    `;
}

function _buildSuccessSummary({ totalStudents, overallAverage, riskCount, coverage, coverageLabel }) {
    return `
        <div class="cc-success-metric">
            <div class="cc-success-metric__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20V10"></path>
                    <path d="M18 20V4"></path>
                    <path d="M6 20v-6"></path>
                </svg>
            </div>
            <div>
                <div class="cc-success-metric__label">Promedio General</div>
                <div class="cc-success-metric__value">${_fmt1(overallAverage)}<span class="cc-success-metric__trend">${overallAverage >= 60 ? 'Consolidado' : 'Revisar'}</span></div>
            </div>
        </div>
        <div class="cc-success-metric cc-success-metric--neutral">
            <div class="cc-success-metric__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
            </div>
            <div>
                <div class="cc-success-metric__label">Cantidad de Estudiantes</div>
                <div class="cc-success-metric__value">${totalStudents}</div>
            </div>
        </div>
        <div class="cc-success-metric cc-success-metric--neutral">
            <div class="cc-success-metric__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 11 12 14 22 4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
            </div>
            <div>
                <div class="cc-success-metric__label">Tareas Entregadas</div>
                <div class="cc-success-metric__value">${Math.round(coverage)}%<span class="cc-success-metric__trend">${_esc(coverageLabel)}</span></div>
            </div>
        </div>
    `;
}

function _avg(values) {
    const clean = (values || []).filter(value => Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function _fmt1(value) {
    if (!Number.isFinite(value)) return '-';
    return String(Math.round(value));
}

function _shortActivityLabel(title, index) {
    const raw = String(title || '').trim();
    if (!raw) return `Actividad ${index + 1}`;

    const match = raw.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*-\s*(.+)$/);
    const compact = match ? `${match[1]} · ${match[2]}` : raw;
    return compact.length > 32 ? `${compact.slice(0, 29)}...` : compact;
}

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Mock de datos para vista previa del dashboard ────────────────
function _buildMockResultado() {
    const nombres = [
        'AGUILAR MAMANI, Luis',
        'CHOQUE FLORES, Maria',
        'CONDORI QUISPE, Carlos',
        'ESPINOZA LAZO, Ana',
        'GARCIA TORREZ, Pedro',
        'HUANCA MAMANI, Rosa',
        'QUISPE CONDORI, Jorge',
        'MAMANI FLORES, Carmen',
        'NINA COPA, Diego',
        'TORREZ AGUILAR, Patricia',
        'VARGAS GUTIERREZ, Ivan',
        'ZENTENO MOLINA, Lucia',
    ];
    const _nota = (max) => Math.round((Math.random() * max * 0.5 + max * 0.4) * 10) / 10;
    const buildColData = (titles, max) => titles.map(titulo => ({
        titulo,
        notas: nombres.map((nombre, i) => ({ nro: i + 1, nombre, nota: _nota(max) })),
    }));
    return {
        es_valido:   true,
        draft_token: null,
        metadatos: {
            maestro:              'Juan Carlos Mamani Quispe',
            area:                 _materia !== '—' ? _materia : 'Matemáticas',
            año_escolaridad:      '1ro A',
            unidad_educativa:     "República de Francia 'A'",
            cantidad_estudiantes: nombres.length,
            gestion:              2026,
            hoja_origen:          '1TRIM',
            '1TRIM_tiene_notas':  true,
            '2TRIM_tiene_notas':  false,
            '3TRIM_tiene_notas':  false,
            headers_actividades: {
                '1TRIM': {
                    saber: buildColData(['15/01 - Evaluación 1', '01/02 - Evaluación 2', '15/02 - Evaluación 3'], 45),
                    hacer: buildColData(['20/01 - Práctica Lab 1', '05/02 - Proyecto 1', '18/02 - Práctica Lab 2'], 40),
                    ser:   buildColData(['Comportamiento', 'Participación', 'Responsabilidad', 'Puntualidad'], 10),
                },
            },
        },
        estudiantes: {
            activos:           nombres.length,
            inactivos:         0,
            no_encontrados:    [],
            lista_estudiantes: nombres.map((nombre, i) => ({ nombre, encontrado: true, activo: true, numero: i + 1 })),
            total_excel:       nombres.length,
            total_bd:          nombres.length,
            curso_verificado:  _curso !== '—' ? _curso : '1ro A',
        },
    };
}

// ── Vista previa del dashboard (datos de muestra para revisar UI) ──
function _previewDashboard() {
    _mostrarResultado(_buildMockResultado());
}

// ── Confirmar y subir notas ───────────────────────────────────────
async function _confirmarPlanilla() {
    if (_confirmandoEnCurso) return;
    if (!_draftToken) {
        showToast('No hay una planilla validada. Vuelve a cargar el archivo.', 'error');
        const dlg = document.getElementById('dlgConfirmarSubida');
        if (dlg) dlg.close();
        return;
    }

    _confirmandoEnCurso = true;

    try {
        const res = await fetchAPI('/api/academics/profesor/confirmar-planilla/', {
            method: 'POST',
            body:   JSON.stringify({ draft_token: _draftToken }),
        });

        if (!res.ok) {
            const msg = res.data?.errores || 'Error al subir las notas. Intenta nuevamente.';
            _dlgSetPanel('confirm');
            const dlg = document.getElementById('dlgConfirmarSubida');
            if (dlg) dlg.close();

            // Si el token venció, volver al upload con mensaje claro
            const tokenVencido = res.status === 400 && msg.toLowerCase().includes('venció');
            if (tokenVencido) {
                _resetUpload();
                showToast('La sesión de validación expiró (30 min). Vuelve a subir el archivo.', 'warning');
            } else {
                showToast(msg, 'error');
            }
            return;
        }

        // Éxito — mostrar panel done con detalle
        _draftToken = null;
        const r = res.data?.resultado || {};
        const detalle = [
            r.insertados   ? `${r.insertados} nuevas`         : '',
            r.actualizados ? `${r.actualizados} actualizadas` : '',
            r.sin_cambios  ? `${r.sin_cambios} sin cambios`   : '',
        ].filter(Boolean).join(' · ');

        const dlgDetalle = document.getElementById('dlgDoneDetalle');
        if (dlgDetalle) dlgDetalle.textContent = detalle || 'Notas guardadas correctamente.';
        _dlgSetPanel('done');

        // Marcar botón externo como completado
        const btn = document.getElementById('btnConfirmar');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Notas subidas
            `;
            btn.classList.add('cc-success-tool--done');
        }

    } catch {
        _dlgSetPanel('confirm');
        const dlg = document.getElementById('dlgConfirmarSubida');
        if (dlg) dlg.close();
        showToast('Error de conexión al subir las notas.', 'error');
    } finally {
        _confirmandoEnCurso = false;
    }
}


// ── Director: botón "Eliminar notas del mes" ─────────────────────────
function _renderBotonEliminarSiDirector(mesObjetivo) {
    if (!_esDirector) return;
    if (!_pcId)        return;

    // Solo aparece si el mes mostrado es el mes actual.
    const mesActual = new Date().getMonth() + 1;
    if (Number(mesObjetivo) !== mesActual) return;

    const head = document.querySelector('#ccDashboard .cc-success-head');
    if (!head) return;

    // Re-render: quitar botón previo si existe
    head.querySelector('#btnDnEliminar')?.remove();

    // Layout: título a la izquierda, botón a la derecha
    head.style.display        = 'flex';
    head.style.alignItems     = 'center';
    head.style.justifyContent = 'space-between';
    head.style.gap            = '16px';
    head.style.flexWrap       = 'wrap';

    const btn = document.createElement('button');
    btn.id    = 'btnDnEliminar';
    btn.title = 'Eliminar la carga de notas de este mes.';
    btn.style.cssText = `
        background:#ef4444;
        color:#fff;
        border:none;
        border-radius:8px;
        padding:10px 18px;
        font-size:.88rem;
        font-weight:600;
        cursor:pointer;
        display:inline-flex;align-items:center;gap:8px;
        transition:filter .15s, box-shadow .15s;
        box-shadow:0 2px 10px rgba(239,68,68,.35);
        flex-shrink:0;
    `;
    btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Eliminar notas del mes`;
    btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.07)'; });
    btn.addEventListener('mouseleave', () => { btn.style.filter = 'none'; });
    btn.addEventListener('click',      () => _confirmarEliminarNotasMes(mesObjetivo));

    head.appendChild(btn);
}

function _confirmarEliminarNotasMes(mes) {
    const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mesNombre = meses[mes] || mes;

    const modal  = document.getElementById('modalEliminarNotas');
    const passEl = document.getElementById('modalElimNPass');
    const errEl  = document.getElementById('modalElimNErr');
    const mesEl  = document.getElementById('modalElimNMes');
    if (!modal) { _ejecutarEliminarNotasMes(mes, ''); return; }

    // Resetear estado del modal
    mesEl.textContent   = mesNombre;
    passEl.value        = '';
    errEl.style.display = 'none';
    errEl.textContent   = '';
    modal.style.display = 'flex';
    setTimeout(() => passEl.focus(), 80);

    // AbortController para limpiar todos los listeners al cerrar
    const ac = new AbortController();
    const sig = ac.signal;

    const cerrar = () => {
        modal.style.display = 'none';
        ac.abort();
    };

    const confirmar = async () => {
        const password = passEl.value.trim();
        if (!password) {
            errEl.textContent   = 'Debes ingresar tu contraseña.';
            errEl.style.display = 'block';
            passEl.focus();
            return;
        }
        const btnOk = document.getElementById('modalElimNConfirm');
        errEl.style.display = 'none';
        btnOk.disabled      = true;
        btnOk.textContent   = 'Eliminando…';
        const resultado = await _ejecutarEliminarNotasMes(mes, password);
        if (resultado === 'error_pass') {
            errEl.textContent   = 'Contraseña incorrecta. Inténtalo de nuevo.';
            errEl.style.display = 'block';
            btnOk.disabled      = false;
            btnOk.textContent   = 'Eliminar';
            passEl.select();
        } else {
            cerrar();
        }
    };

    document.getElementById('modalElimNConfirm').addEventListener('click', confirmar, { signal: sig });
    document.getElementById('modalElimNCancel').addEventListener('click', cerrar,    { signal: sig });
    passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); }, { signal: sig });
    modal.addEventListener('click',    (e) => { if (e.target === modal) cerrar(); },  { signal: sig });
}

async function _ejecutarEliminarNotasMes(mes, password) {
    const btn = document.getElementById('btnDnEliminar');

    try {
        const token = localStorage.getItem('access_token');
        const res = await fetch('/api/academics/director/eliminar-notas-mes/', {
            method:  'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({ pc_id: _pcId, mes, password }),
        });

        if (res.status === 403) return 'error_pass';

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            _apiToast(data.errores || `No se pudo eliminar (HTTP ${res.status}).`, 'error');
            return 'error';
        }

        const data = await res.json();
        _apiToast(
            `Eliminadas: ${data.detalle_notas_borrados ?? 0} notas nuevas, ` +
            `${data.detalle_notas_revertidos ?? 0} revertidas.`,
            'success',
        );
        setTimeout(() => window.location.reload(), 1200);
        return 'ok';
    } catch (err) {
        console.error(err);
        _apiToast('Error de conexión al eliminar.', 'error');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        return 'error';
    }
}
