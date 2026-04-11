'use strict';

// ── Parámetros de URL ─────────────────────────────────────────────
const _params  = new URLSearchParams(window.location.search);
const _pcId    = _params.get('pc_id')   || '';
const _materia = _params.get('materia') || '—';
const _curso   = _params.get('curso')   || '—';
const _mes     = _params.get('mes')     || '';

// ── Estado interno ────────────────────────────────────────────────
let _archivo = null;
let _validacionEnCurso = false;
let _validationStepTimer = null;

// ── Bootstrap ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    const user  = JSON.parse(localStorage.getItem('user') || 'null');
    if (!token || !user || user.tipo_usuario !== 'Profesor') {
        window.location.replace('/login/');
        return;
    }

    // Poblar metadatos
    document.getElementById('ccCurso').textContent   = _curso;
    document.getElementById('ccMateria').textContent = _materia;

    // Badge período
    const mesNum = parseInt(_mes, 10);
    const meses  = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mesLabel = (mesNum >= 1 && mesNum <= 12) ? meses[mesNum] : 'Período actual';
    const periodBadge = document.getElementById('ccPeriodBadge');
    const deptBadge   = document.getElementById('ccDeptBadge');
    if (periodBadge) periodBadge.textContent = mesLabel.toUpperCase();
    if (deptBadge)   deptBadge.textContent   = _materia !== '—' ? _materia : 'Carga de notas';

    _initDragDrop();
    _initButtons();
});

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
    document.getElementById('ccDropTitle').textContent = 'Arrastra tu archivo Excel aqui';
    document.getElementById('ccDropSub').textContent = 'O haz clic para buscar en tu ordenador. AsegÃºrate de que el archivo siga el formato de la plantilla oficial para una validaciÃ³n exitosa.';
    document.getElementById('btnSelectFile').style.display = '';
    document.getElementById('btnValidar').style.display = 'none';
    document.getElementById('btnValidar').disabled = true;
}

function _initButtons() {
    document.getElementById('btnValidar').addEventListener('click', () => {
        if (_validacionEnCurso) return;
        _validarPlanilla();
    });

    document.getElementById('btnCambiarArchivo').addEventListener('click', () => {
        if (_validacionEnCurso) return;
        _resetUpload();
    });
}

function _setValidationBusy(isBusy) {
    _validacionEnCurso = isBusy;

    const card = document.getElementById('ccCard');
    const btnSelect = document.getElementById('btnSelectFile');
    const btnValidar = document.getElementById('btnValidar');
    const btnCambiar = document.getElementById('btnCambiarArchivo');
    const input = document.getElementById('excelInput');

    card.classList.toggle('is-busy', isBusy);
    btnSelect.disabled = isBusy;
    btnValidar.disabled = isBusy || !_archivo;
    btnCambiar.disabled = isBusy;
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
    btnVal.style.display = '';
    btnVal.disabled      = false;
}

function _resetUpload() {
    if (_validacionEnCurso) return;

    _hideInlineObservation();
    _clearSelectedFileState();
    document.getElementById('ccDropTitle').textContent = 'Arrastra tu archivo Excel aquí';
    document.getElementById('ccDropSub').textContent   = 'O haz clic para buscar en tu ordenador. Asegúrate de que el archivo siga el formato de la plantilla oficial para una validación exitosa.';
    document.getElementById('btnSelectFile').style.display = '';
    document.getElementById('btnValidar').style.display    = 'none';
    document.getElementById('btnValidar').disabled         = true;

    // Ocultar resultado y volver a upload
    document.getElementById('ccResultView').classList.remove('visible');
    document.getElementById('ccResultView').classList.remove('cc-result-view--success');
    document.getElementById('ccUploadView').style.display = '';
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
        data = await res.json();
        ok   = res.ok;
    } catch (error) {
        ok   = false;
        data = { mensaje: error?.name === 'AbortError'
            ? 'La validación tardó demasiado. Intenta nuevamente.'
            : 'Error de conexión. Intenta nuevamente.' };
    }

    window.clearTimeout(timeoutId);
    btnVal.textContent = 'Validar Planilla';
    _hideValidationModal();

    if (!ok) {
        _showInlineObservation(data?.mensaje || 'Error de conexión. Intenta nuevamente.');
        return;
    }
    if (!data.es_valido) {
        if (data.errores_estudiantes?.length) {
            _showInlineObservationList(data.errores_estudiantes);
        } else {
            _showInlineObservation(data.mensaje || 'Se detectó una observación en la planilla.');
        }
        return;
    }
    _mostrarResultado(data);
}

// ── Mostrar resultado ─────────────────────────────────────────────
function _mostrarResultado(r) {
    const meta = r.metadatos || {};
    const resultView = document.getElementById('ccResultView');

    _hideInlineObservation();

    // Pasar de vista upload a vista resultado
    document.getElementById('ccUploadView').style.display = 'none';
    resultView.classList.add('visible');

    // Nombre del archivo en topbar de resultado
    document.getElementById('ccResultFilename').textContent = _archivo ? _archivo.name : '';

    // Badge de estado — solo llega aquí si es_valido: true
    const statusBadge = document.getElementById('ccStatusBadge');
    statusBadge.innerHTML = `<span class="cc-status-badge cc-status-badge--ok">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Planilla válida</span>`;

    // Meta rows
    const metaFields = [
        ['Maestro/a',        meta.maestro],
        ['Área',             meta.area],
        ['Año escolaridad',  meta.año_escolaridad],
        ['Unidad educativa', meta.unidad_educativa],
        ['Estudiantes',      meta.cantidad_estudiantes],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');

    document.getElementById('ccMetaRows').innerHTML = metaFields.map(([l, v]) => `
        <div class="cc-meta-row">
            <span class="cc-meta-row__label">${l}</span>
            <span class="cc-meta-row__val">${_esc(String(v))}</span>
        </div>
    `).join('');

    // Trim chips
    const trimRow = document.getElementById('ccTrimRow');
    const chips   = ['1TRIM','2TRIM','3TRIM'].map(t => {
        const tiene = meta[`${t}_tiene_notas`];
        return `<span class="cc-trim-chip" style="
            background:${tiene ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.04)'};
            border:1px solid ${tiene ? 'rgba(34,197,94,.25)' : 'var(--border-subtle)'};
            color:${tiene ? '#22c55e' : 'var(--text-muted)'};">${t}</span>`;
    }).join('');
    document.getElementById('ccTrimChips').innerHTML = chips;
    trimRow.style.display = Object.keys(meta).length ? '' : 'none';

    // Preview: errores o datos
    const errorPanel  = document.getElementById('ccErrorPanel');
    const notasPanel  = document.getElementById('ccNotasPanel');
    const emptyPanel  = document.getElementById('ccPreviewEmpty');
    const previewBadge = document.getElementById('ccPreviewBadge');

    errorPanel.style.display = 'none';
    notasPanel.style.display = 'none';
    emptyPanel.style.display = 'none';
    resultView.classList.remove('cc-result-view--success');

    // Advertencias (planilla válida pero con observaciones menores)
    const dashboardHtml = _renderSuccessDashboard(r);
    if (dashboardHtml) {
        resultView.classList.add('cc-result-view--success');
        notasPanel.innerHTML = dashboardHtml;
        notasPanel.style.display = '';
        previewBadge.textContent = '';
        return;
    }

    const estudiantesHtml = r.estudiantes ? _renderEstudiantes(r.estudiantes) : '';
    const notasHtml       = r.notas       ? _renderNotas(r.notas)             : '';
    notasPanel.innerHTML     = `<div style="padding:0 20px 20px;">${estudiantesHtml}${notasHtml}</div>`;
    notasPanel.style.display = '';
    previewBadge.textContent = meta.cantidad_estudiantes ? `${meta.cantidad_estudiantes} estudiantes` : '';
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

    return orden.map(trim => {
        const td = trimestres[trim];
        if (!td) return '';

        const saberHtml  = _renderDim(td.saber, 'SABER', '#6366f1', 45);
        const hacerHtml  = _renderDim(td.hacer, 'HACER', '#0ea5e9', 40);
        const tieneDatos = td.saber.casilleros.length > 0 || td.hacer.casilleros.length > 0;

        return `
        <div style="margin-top:14px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.trim-chevron').style.transform=this.nextElementSibling.style.display==='none'?'rotate(0deg)':'rotate(180deg)';"
                style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-hover);border:none;cursor:pointer;color:var(--text);font-family:inherit;">
                <span style="font-weight:700;font-size:.9rem;">${labels[trim]}</span>
                <span style="display:flex;align-items:center;gap:8px;">
                    ${tieneDatos
                        ? `<span style="font-size:.7rem;color:#22c55e;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);padding:2px 8px;border-radius:99px;font-weight:700;">Con notas</span>`
                        : `<span style="font-size:.7rem;color:var(--text-muted);background:var(--bg-input);border:1px solid var(--border);padding:2px 8px;border-radius:99px;">Sin notas</span>`}
                    <svg class="trim-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s;transform:rotate(180deg);"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
            </button>
            <div style="display:block;">${saberHtml}${hacerHtml}${!tieneDatos ? '<p style="text-align:center;color:var(--text-muted);font-size:.85rem;padding:20px;">Sin notas registradas en este trimestre.</p>' : ''}</div>
        </div>`;
    }).join('');
}

function _renderDim(dim, titulo, color, maxPts) {
    if (!dim.casilleros.length) return '';

    const headers = dim.casilleros.map(c =>
        `<th style="min-width:80px;text-align:center;">${_esc(c)}</th>`
    ).join('');

    const filas = dim.datos.map(est => {
        const celdas = dim.casilleros.map(c => {
            const v = est.notas[c];
            return `<td style="text-align:center;font-variant-numeric:tabular-nums;">${v !== null && v !== undefined ? v : '<span style="color:var(--text-muted);">—</span>'}</td>`;
        }).join('');
        const prom = est.promedio;
        const promColor = prom === null || prom === undefined ? 'var(--text-muted)'
            : prom >= maxPts * 0.7 ? '#22c55e' : prom >= maxPts * 0.5 ? '#f59e0b' : '#ef4444';
        return `<tr>
            <td style="font-variant-numeric:tabular-nums;color:var(--text-muted);text-align:center;">${est.numero ?? ''}</td>
            <td style="white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${_esc(est.nombre)}</td>
            ${celdas}
            <td style="text-align:center;font-weight:700;color:${promColor};">${prom !== null && prom !== undefined ? prom : '—'}</td>
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

function _renderSuccessDashboard(r) {
    const meta = r.metadatos || {};
    const headersByTrim = meta.headers_actividades || {};
    const trimOrder = ['1TRIM', '2TRIM', '3TRIM'];
    const trimKey = (meta.hoja_origen && headersByTrim[meta.hoja_origen])
        ? meta.hoja_origen
        : (trimOrder.find(key => headersByTrim[key]) || Object.keys(headersByTrim)[0]);

    if (!trimKey || !headersByTrim[trimKey]) return '';

    const trimData = headersByTrim[trimKey];
    const dimensionDefs = [
        { key: 'saber', label: 'Saber (Evaluaciones Teoricas)', css: 'saber', short: 'Saber' },
        { key: 'hacer', label: 'Hacer (Laboratorio y Practica)', css: 'hacer', short: 'Hacer' },
        { key: 'ser',   label: 'Ser / Decidir',                  css: 'ser',   short: 'Ser' },
    ];

    const dimensions = dimensionDefs
        .map(def => ({ ...def, columns: Array.isArray(trimData[def.key]) ? trimData[def.key] : [] }))
        .filter(def => def.columns.length);

    if (!dimensions.length) return '';

    const rowMap = new Map();
    const allCellKeys = [];

    dimensions.forEach(dim => {
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
        return {
            ...row,
            promedio: _avg(values),
        };
    });

    const dimAverages = {};
    dimensions.forEach(dim => {
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
    const trimLabels = {
        '1TRIM': 'Primer Trimestre',
        '2TRIM': 'Segundo Trimestre',
        '3TRIM': 'Tercer Trimestre',
    };
    const trimLabel = trimLabels[trimKey] || trimKey;

    const groupedHeaders = dimensions.map(dim => `
        <th class="cc-success-table__group cc-success-table__group--${dim.css}" colspan="${dim.columns.length}">
            ${_esc(dim.label)}
        </th>
    `).join('');

    const rotatedHeaders = dimensions.map(dim => dim.columns.map((col, index) => `
        <th class="cc-success-table__head cc-success-table__head--rot" title="${_esc(col.titulo || '')}">
            <span>${_esc(_shortActivityLabel(col.titulo, index))}</span>
        </th>
    `).join('')).join('');

    const tableRows = rowSummaries.map(row => {
        const scoreCells = dimensions.map(dim => dim.columns.map(col => {
            const value = row.values[col.__cellKey];
            return Number.isFinite(value)
                ? `<td class="cc-success-table__score">${_fmt1(value)}</td>`
                : `<td class="cc-success-table__score is-empty">-</td>`;
        }).join('')).join('');

        return `
            <tr>
                <td class="cc-success-table__nro">${String(row.nro).padStart(2, '0')}</td>
                <td class="cc-success-table__name">${_esc(row.nombre)}</td>
                ${scoreCells}
                <td class="cc-success-table__avg">${_fmt1(row.promedio)}</td>
            </tr>
        `;
    }).join('');

    const dimFooter = dimensions.map(dim => `
        <div class="cc-success-dim">
            <span class="cc-success-dim-bar cc-success-dim-bar--${dim.css}"></span>
            <span>${_esc(dim.short)} Promedio: ${_fmt1(dimAverages[dim.key])}</span>
        </div>
    `).join('');

    return `
        <div class="cc-success-report">
            <div class="cc-success-head">
                <div>
                    <h2 class="cc-success-title">Registro de Notas - ${_esc(_materia)} - ${_esc(_curso)}</h2>
                    <p class="cc-success-sub">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        ${_esc(`${trimLabel} ${gestion}`)}
                    </p>
                </div>
                <div class="cc-success-actions">
                    <button class="cc-success-tool" type="button" onclick="_resetUpload()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Cambiar archivo
                    </button>
                    <button class="cc-success-tool" type="button" onclick="window.print()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 9V2h12v7"></path>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        Exportar a PDF
                    </button>
                </div>
            </div>

            <div class="cc-success-table-shell">
                <div class="cc-success-table-wrap">
                    <table class="cc-success-table">
                        <thead>
                            <tr>
                                <th class="cc-success-table__head cc-success-table__head--fixed" rowspan="2">Nro</th>
                                <th class="cc-success-table__head cc-success-table__head--fixed" rowspan="2">Nombre Completo</th>
                                ${groupedHeaders}
                                <th class="cc-success-table__head cc-success-table__head--fixed" rowspan="2">Promedio</th>
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

            <div class="cc-success-metrics">
                ${_buildSuccessSummary({
                    totalStudents: rows.length,
                    overallAverage,
                    riskCount,
                    coverage,
                    coverageLabel,
                })}
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
        <div class="cc-success-metric cc-success-metric--warn">
            <div class="cc-success-metric__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </div>
            <div>
                <div class="cc-success-metric__label">Estudiantes en Riesgo</div>
                <div class="cc-success-metric__value">${riskCount}<span class="cc-success-metric__sub">/ ${totalStudents}</span></div>
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
    return (Math.round(value * 10) / 10).toFixed(1);
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
