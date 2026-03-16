'use strict';

/* ================================================================
   profesor.js — Lógica del panel del Profesor
   ================================================================ */

// ── Constantes de motivos ─────────────────────────────────────────
const MOTIVOS = {
    FALTAS:      'Faltas',
    DISCIPLINA:  'Disciplina',
    ACADEMICO:   'Académico',
    OTRO:        'Otro',
};

const ASISTENCIA_LABELS = {
    PENDIENTE:   'Pendiente',
    ASISTIO:     'Asistió',
    NO_ASISTIO:  'No asistió',
    ATRASO:      'Atraso',
    VENCIDA:     'Vencida',
};

const ASISTENCIA_BADGES = {
    PENDIENTE:  'badge--warning',
    ASISTIO:    'badge--success',
    NO_ASISTIO: 'badge--error',
    ATRASO:     'badge--warning',
    VENCIDA:    'badge--neutral',
};

// ── Estado local ──────────────────────────────────────────────────
let _cursos = [];

// ── Inicialización ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _initSidebar();
    _initLogout();
    _initUserInfo();
    _initTabs();
    _initDragDrop();
    _initCitacionForm();
    _initPlanForm();
    _initPrimerIngreso();
    cargarCursos();
    _verificarDotPlan();  // dot de notificación en background
});

// ── Tabs ──────────────────────────────────────────────────────────
const _TABS    = ['panelNotas', 'panelCitaciones', 'panelPlan', 'panelCuenta'];
const _TAB_BTNS = {
    panelNotas:      'sideNotas',
    panelCitaciones: 'sideCitaciones',
    panelPlan:       'sidePlan',
    panelCuenta:     'sideCuenta',
};

function _activarTab(panelId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    _TABS.forEach(id => {
        const btn = document.getElementById(_TAB_BTNS[id]);
        if (btn) btn.classList.toggle('active', id === panelId);
    });
    if (panelId === 'panelCitaciones') cargarHistorial();
    if (panelId === 'panelPlan')       cargarPlanes();
    if (panelId === 'panelCuenta')     _initCuentaTab();
}

function _initTabs() {
    document.getElementById('sideNotas').addEventListener('click',      () => _activarTab('panelNotas'));
    document.getElementById('sideCitaciones').addEventListener('click', () => _activarTab('panelCitaciones'));
    document.getElementById('sidePlan').addEventListener('click',       () => _activarTab('panelPlan'));
    document.getElementById('sideCuenta').addEventListener('click',     () => _activarTab('panelCuenta'));
}

// ── Sidebar (hamburguesa) ─────────────────────────────────────────
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

    document.addEventListener('mousemove', function _check(e) {
        document.removeEventListener('mousemove', _check);
        if (!isDesktop()) return;
        const r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top  && e.clientY <= r.bottom) {
            sidebar.classList.add('sidebar--expanded');
        }
    });

    function openSidebar()  { sidebar.classList.add('sidebar--open');    backdrop.classList.add('visible'); }
    function closeSidebar() { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); }

    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()
    );
    backdrop.addEventListener('click', closeSidebar);
}

// ── Logout ────────────────────────────────────────────────────────
function _initLogout() {
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });
}

// ── Info del usuario en sidebar ───────────────────────────────────
function _initUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;
    const nombre = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    document.getElementById('profileName').textContent = nombre;
    document.getElementById('profileRole').textContent = user.tipo_usuario || 'Profesor';
}

// ── Drag & Drop Excel ─────────────────────────────────────────────
function _initDragDrop() {
    const zone    = document.getElementById('dropZone');
    const input   = document.getElementById('excelInput');
    const nameEl  = document.getElementById('nombreArchivo');
    const btnUp   = document.getElementById('btnSubirNotas');

    function setFile(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            showAppToast('error', 'Formato inválido', 'Solo se aceptan archivos .xlsx o .xls');
            return;
        }
        nameEl.textContent = file.name;
        nameEl.style.display = 'block';
        btnUp.disabled = false;
        zone.classList.add('drop-zone--has-file');
    }

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
        if (input.files[0]) setFile(input.files[0]);
    });

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('drop-zone--over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-zone--over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drop-zone--over');
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    // Botón "Subir" — solo UI por ahora
    btnUp.addEventListener('click', () => {
        showAppToast('info', 'Próximamente', 'La carga de notas estará disponible pronto.');
    });
}

// ── Formulario de nueva citación ──────────────────────────────────
function _initCitacionForm() {
    const selectCurso = document.getElementById('citCurso');
    const selectEst   = document.getElementById('citEstudiante');

    // No permitir fechas pasadas en la fecha límite de citación
    const inputFechaLimite = document.getElementById('citFechaLimite');
    inputFechaLimite.min = new Date().toISOString().split('T')[0];

    selectCurso.addEventListener('change', () => {
        const cursoId = selectCurso.value;
        _resetSelect(selectEst, 'Selecciona un estudiante');
        if (!cursoId) return;
        cargarEstudiantes(cursoId);
    });

    document.getElementById('formCitacion').addEventListener('submit', async e => {
        e.preventDefault();
        await enviarCitacion();
    });
}

function _resetSelect(el, placeholder) {
    el.innerHTML = `<option value="">— ${placeholder} —</option>`;
    el.disabled = true;
}

// ── Cargar cursos del profesor ────────────────────────────────────
async function cargarCursos() {
    const { ok, data } = await fetchAPI('/api/academics/profesor/cursos/');
    if (!ok) return;

    _cursos = data;
    const sel = document.getElementById('citCurso');
    sel.innerHTML = '<option value="">— Selecciona un curso —</option>';
    data.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.grado} "${c.paralelo}"`;
        sel.appendChild(opt);
    });
    sel.disabled = false;
}

// ── Cargar estudiantes de un curso ────────────────────────────────
async function cargarEstudiantes(cursoId) {
    const { ok, data } = await fetchAPI(`/api/students/curso/${cursoId}/estudiantes/`);
    const sel = document.getElementById('citEstudiante');
    if (!ok) {
        showAppToast('error', 'Error', 'No se pudieron cargar los estudiantes.');
        return;
    }
    sel.innerHTML = '<option value="">— Selecciona un estudiante —</option>';
    const activos = data.filter(e => e.activo !== false);
    activos.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.apellidos || (e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}`;
        sel.appendChild(opt);
    });
    sel.disabled = activos.length === 0;
}

// ── Enviar citación ───────────────────────────────────────────────
async function enviarCitacion() {
    const btn = document.getElementById('btnEnviarCitacion');
    const estudianteId  = document.getElementById('citEstudiante').value;
    const motivo        = document.getElementById('citMotivo').value;
    const descripcion   = document.getElementById('citDescripcion').value.trim();
    const fechaLimite   = document.getElementById('citFechaLimite').value;
    const errorEl       = document.getElementById('citError');

    errorEl.style.display = 'none';

    if (!estudianteId || !motivo || !fechaLimite) {
        errorEl.textContent = 'Completa todos los campos obligatorios.';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const { ok, data, status } = await fetchAPI('/api/discipline/citaciones/crear/', {
        method: 'POST',
        body: JSON.stringify({
            estudiante: parseInt(estudianteId),
            motivo,
            descripcion,
            estado: 'ENVIADA',
            fecha_limite_asistencia: fechaLimite,
        }),
    });

    btn.disabled = false;
    btn.textContent = 'Enviar Citación';

    if (!ok) {
        const msg = data?.errores || data?.estudiante?.[0] || data?.motivo?.[0] || 'Error al crear la citación.';
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        return;
    }

    showAppToast('success', 'Citación enviada', 'La citación fue registrada correctamente.');
    document.getElementById('formCitacion').reset();
    document.getElementById('citEstudiante').disabled = true;
    document.getElementById('nombreArchivo').style.display = 'none';
    await cargarHistorial();
}

// ── Plan de Trabajo ───────────────────────────────────────────────
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const SVG_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
</svg>`;

// ── Estado del plan ────────────────────────────────────────────────
let _planAsignaciones = [];         // ProfesorCurso[] del profesor
let _planPlanesCache  = {};         // { mes: { pc_id: [plan, ...] } }
let _planModalPcId    = null;
let _planModalMes     = null;
let _planModalEditable = true;
let _planHistCargado  = false;

function _initPlanForm() {
    // botón Ver historial
    const btn  = document.getElementById('btnVerHistorial');
    const wrap = document.getElementById('planHistorialWrap');

    btn.addEventListener('click', async () => {
        const visible = wrap.style.display !== 'none';
        if (visible) {
            wrap.style.display = 'none';
            btn.classList.remove('active');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> Ver planes pasados`;
        } else {
            wrap.style.display = 'block';
            btn.classList.add('active');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg> Ocultar planes pasados`;
            if (!_planHistCargado) {
                await cargarHistorialPlanes();
                _planHistCargado = true;
            }
        }
    });

    // modal plan — cerrar
    document.getElementById('planModalClose').addEventListener('click', _cerrarPlanModal);
    document.getElementById('planModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) _cerrarPlanModal();
    });

    // modal advertencia sin guardar
    document.getElementById('warnSinGuardarQuedarme').addEventListener('click', () => {
        document.getElementById('warnSinGuardarOverlay').classList.remove('visible');
    });
    document.getElementById('warnSinGuardarSalir').addEventListener('click', () => {
        document.getElementById('warnSinGuardarOverlay').classList.remove('visible');
        _forzarCerrarPlanModal();
    });

    // modal plan — guardar todos
    document.getElementById('planModalGuardar').addEventListener('click', _pedirConfirmGuardar);

    // confirmación antes de guardar
    const backdrop = document.getElementById('planConfirmBackdrop');
    document.getElementById('planConfirmCancelar').addEventListener('click', () => {
        backdrop.classList.remove('visible');
    });
    document.getElementById('planConfirmAceptar').addEventListener('click', async () => {
        backdrop.classList.remove('visible');
        await _guardarPlanesModal();
    });
}

// ── Utilidades de calendario ──────────────────────────────────────
function _semanasMes(mes, año) {
    const primerDia = new Date(año, mes - 1, 1);
    const dowLun = (primerDia.getDay() + 6) % 7;
    const diasHastaLunes = (7 - dowLun) % 7;
    return [0, 1, 2, 3].map(i => {
        const lunes  = new Date(año, mes - 1, 1 + diasHastaLunes + i * 7);
        const domingo = new Date(lunes);
        domingo.setDate(domingo.getDate() + 6);
        return { inicio: lunes, fin: domingo };
    });
}

function _periodoSemana(mes, semana) {
    const año = new Date().getFullYear();
    const { inicio, fin } = _semanasMes(mes, año)[semana - 1];
    const fmt = d => d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
    return { display: `${fmt(inicio)} – ${fmt(fin)}` };
}

// ── Carga principal del mes actual ────────────────────────────────
async function cargarPlanes() {
    const grid    = document.getElementById('planAsigGrid');
    const spinner = document.getElementById('planSpinner');
    grid.style.display = 'none';
    spinner.style.display = 'flex';

    // Cargar asignaciones una sola vez
    if (!_planAsignaciones.length) {
        const { ok, data } = await fetchAPI('/api/academics/profesor/mis-asignaciones/');
        if (!ok) {
            spinner.style.display = 'none';
            showAppToast('error', 'Error', 'No se pudieron cargar las asignaciones.');
            return;
        }
        _planAsignaciones = data;
    }

    const mes = new Date().getMonth() + 1;
    await _refrescarPlanesCache(mes);

    spinner.style.display = 'none';
    grid.style.display = 'grid';
    _renderPlanCards(mes);
    _actualizarNotificaciones(mes);
}

async function _refrescarPlanesCache(mes) {
    const { ok, data } = await fetchAPI(`/api/academics/profesor/planes/?mes=${mes}`);
    if (!ok) return;
    const pcMap = {};
    _planAsignaciones.forEach(a => { pcMap[a.id] = []; });
    data.forEach(p => { if (pcMap[p.profesor_curso_id] !== undefined) pcMap[p.profesor_curso_id].push(p); });
    _planPlanesCache[mes] = pcMap;
}

// ── Tarjetas de asignaciones ──────────────────────────────────────
function _renderPlanCards(mes) {
    const grid = document.getElementById('planAsigGrid');
    const pcMap = _planPlanesCache[mes] || {};

    grid.innerHTML = _planAsignaciones.map(asig => {
        const plans = pcMap[asig.id] || [];
        const dots  = [1, 2, 3, 4].map(s => {
            const ok = plans.some(p => p.semana === s);
            return `<span class="plan-asig-dot${ok ? '' : ' plan-asig-dot--empty'}"></span>`;
        }).join('');
        return `<div class="plan-asig-card" data-pc-id="${asig.id}" data-mes="${mes}">
            <div>
                <div class="plan-asig-card__materia">${_escapeHtml(asig.materia_nombre)}</div>
                <div class="plan-asig-card__curso">${_escapeHtml(asig.curso_nombre)}</div>
            </div>
            <div class="plan-asig-dots">${dots}</div>
            <div class="plan-asig-card__count">${plans.length} de 4 semanas</div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.plan-asig-card').forEach(card => {
        card.addEventListener('click', () =>
            _abrirPlanModal(parseInt(card.dataset.pcId), parseInt(card.dataset.mes), true)
        );
    });
}

// ── Modal de plan por asignación ──────────────────────────────────
function _abrirPlanModal(pcId, mes, editable) {
    _planModalPcId     = pcId;
    _planModalMes      = mes;
    _planModalEditable = editable;

    const asig = _planAsignaciones.find(a => a.id === pcId);
    if (!asig) return;

    document.getElementById('planModalMateria').textContent = asig.materia_nombre;
    document.getElementById('planModalCurso').textContent   = asig.curso_nombre;
    _renderPlanModalTbody(pcId, mes, editable);
    document.getElementById('planModalOverlay').classList.add('visible');
}

function _cerrarPlanModal() {
    const hayContenido = [...document.querySelectorAll('#planModalTbody textarea')]
        .some(ta => ta.value.trim());
    if (hayContenido) {
        document.getElementById('warnSinGuardarOverlay').classList.add('visible');
        return;
    }
    _forzarCerrarPlanModal();
}

function _forzarCerrarPlanModal() {
    document.getElementById('planModalOverlay').classList.remove('visible');
    _planModalPcId = null;
    _planModalMes  = null;
}

function _renderPlanModalTbody(pcId, mes, editable) {
    const tbody  = document.getElementById('planModalTbody');
    const footer = document.getElementById('planModalFooter');
    const plans  = (_planPlanesCache[mes] || {})[pcId] || [];
    const mapa   = {};
    plans.forEach(p => { mapa[p.semana] = p; });

    tbody.innerHTML = '';
    let hayVacias = false;

    for (let semana = 1; semana <= 4; semana++) {
        const plan = mapa[semana] || null;
        const { display } = _periodoSemana(mes, semana);
        const tr = document.createElement('tr');

        const dotCls      = plan ? 'plan-semana-dot' : 'plan-semana-dot plan-semana-dot--empty';
        const semanaCell  = `<td data-label="Semana"><span class="plan-semana-badge"><span class="${dotCls}"></span>Semana ${semana}</span></td>`;
        const periodoCell = `<td data-label="Período"><span class="plan-periodo">${display}</span></td>`;

        if (plan) {
            tr.innerHTML = `${semanaCell}${periodoCell}
                <td data-label="Plan"><span class="plan-desc-text">${_escapeHtml(plan.descripcion)}</span></td>
                <td></td>`;
        } else {
            hayVacias = true;
            tr.innerHTML = `${semanaCell}${periodoCell}
                <td data-label="Plan">${editable
                    ? `<div class="plan-inline-form"><textarea data-semana="${semana}" placeholder="Plan de trabajo para la semana ${semana}… (mín. 20 caracteres)" maxlength="500" minlength="20"></textarea><span class="plan-inline-error"></span></div>`
                    : '<span class="plan-desc-vacia">Sin plan registrado</span>'
                }</td>
                <td></td>`;
        }
        tbody.appendChild(tr);
    }

    if (footer) footer.style.display = editable && hayVacias ? 'flex' : 'none';

    // Habilitar botón solo cuando todos los textareas tengan ≥ 20 chars
    if (editable && hayVacias) {
        const btn = document.getElementById('planModalGuardar');
        btn.disabled = true;
        tbody.querySelectorAll('textarea').forEach(ta => {
            ta.addEventListener('input', _actualizarBtnGuardar);
        });
    }
}

function _actualizarBtnGuardar() {
    const textareas = [...document.querySelectorAll('#planModalTbody textarea')];
    const btn = document.getElementById('planModalGuardar');
    if (!btn) return;
    btn.disabled = textareas.length === 0 || !textareas.every(ta => ta.value.trim().length >= 20);
}

function _pedirConfirmGuardar() {
    const asig  = _planAsignaciones.find(a => a.id === _planModalPcId);
    const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('planConfirmSub').textContent =
        `Estás a punto de registrar los planes de trabajo de ${meses[_planModalMes]} para:`;
    document.getElementById('planConfirmDetalle').innerHTML =
        `<span class="plan-confirm-tag">${_escapeHtml(asig.materia_nombre)}</span> &mdash; <span class="plan-confirm-tag">${_escapeHtml(asig.curso_nombre)}</span>`;
    document.getElementById('planConfirmBackdrop').classList.add('visible');
}

async function _guardarPlanesModal() {
    const textareas  = [...document.querySelectorAll('#planModalTbody textarea')];
    const pendientes = textareas.map(ta => ({ semana: parseInt(ta.dataset.semana), desc: ta.value.trim(), ta }));

    const btn = document.getElementById('planModalGuardar');
    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    let errores = 0;
    for (const { semana, desc, ta } of pendientes) {
        const { ok, data } = await fetchAPI('/api/academics/profesor/planes/', {
            method: 'POST',
            body: JSON.stringify({ mes: _planModalMes, semana, descripcion: desc, profesor_curso_id: _planModalPcId }),
        });
        if (!ok) {
            errores++;
            ta.classList.add('invalid');
            const err = ta.closest('.plan-inline-form')?.querySelector('.plan-inline-error');
            if (err) { err.textContent = data?.errores || 'Error al guardar.'; err.style.display = 'block'; }
        }
    }

    btn.textContent = 'Guardar planes';

    await _refrescarPlanesCache(_planModalMes);
    _renderPlanModalTbody(_planModalPcId, _planModalMes, true);
    _renderPlanCards(_planModalMes);
    _actualizarNotificaciones(_planModalMes);

    if (!errores) {
        showAppToast('success', 'Guardado', `Plan de trabajo registrado correctamente.`);
    }
}



// ── Verificación background (dot en sidebar) ──────────────────────
async function _verificarDotPlan() {
    // Necesita asignaciones para saber cuántos se esperan
    if (!_planAsignaciones.length) {
        const { ok, data } = await fetchAPI('/api/academics/profesor/mis-asignaciones/');
        if (!ok) return;
        _planAsignaciones = data;
    }
    const mes = new Date().getMonth() + 1;
    const { ok, data } = await fetchAPI(`/api/academics/profesor/planes/?mes=${mes}`);
    if (!ok) return;
    // Si alguna asignación tiene < 4 planes → dot visible
    const conteo = {};
    _planAsignaciones.forEach(a => { conteo[a.id] = 0; });
    data.forEach(p => { if (conteo[p.profesor_curso_id] !== undefined) conteo[p.profesor_curso_id]++; });
    const incompleto = _planAsignaciones.some(a => conteo[a.id] < 4);
    document.getElementById('planDot').classList.toggle('visible', incompleto);
}

function _actualizarNotificaciones(mes) {
    const pcMap     = _planPlanesCache[mes] || {};
    const incompleto = _planAsignaciones.some(a => (pcMap[a.id] || []).length < 4);
    document.getElementById('planDot').classList.toggle('visible', incompleto);
    document.getElementById('planBanner').classList.toggle('visible', incompleto);
    if (incompleto) document.getElementById('planBannerMes').textContent = MESES[mes];
}

// ── Historial ─────────────────────────────────────────────────────
async function cargarHistorialPlanes() {
    const content = document.getElementById('planHistorialContent');
    content.innerHTML = `<div class="historial-spinner" style="padding:32px 0;"><div class="spinner"></div></div>`;

    const { ok, data } = await fetchAPI('/api/academics/profesor/planes/historial/');
    if (!ok) {
        content.innerHTML = `<p class="plan-historial-vacio">Error al cargar el historial.</p>`;
        return;
    }
    if (!data.length) {
        content.innerHTML = `<p class="plan-historial-vacio">No hay planes de trabajo anteriores registrados.</p>`;
        return;
    }

    // Agrupar por mes → por pc_id
    const porMes = {};
    data.forEach(p => {
        if (!porMes[p.mes]) porMes[p.mes] = {};
        if (!porMes[p.mes][p.profesor_curso_id]) porMes[p.mes][p.profesor_curso_id] = [];
        porMes[p.mes][p.profesor_curso_id].push(p);
    });

    // Guardar en cache para que el modal pueda mostrar el contenido
    Object.entries(porMes).forEach(([mes, pcMap]) => {
        _planAsignaciones.forEach(a => { if (!pcMap[a.id]) pcMap[a.id] = []; });
        _planPlanesCache[parseInt(mes)] = pcMap;
    });

    const frag = document.createDocumentFragment();
    Object.keys(porMes).sort((a, b) => b - a).forEach(mesStr => {
        const mesNum = parseInt(mesStr);
        const pcMap  = porMes[mesStr];

        // Obtener pc_ids que tienen al menos 1 plan en este mes
        const pcIds = Object.keys(pcMap).map(Number).filter(id => pcMap[id].length > 0);

        const group = document.createElement('div');
        group.className = 'plan-historial-mes-group';

        const label = document.createElement('div');
        label.className = 'plan-historial-mes-label';
        label.textContent = MESES[mesNum];
        group.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'plan-asig-grid';
        grid.style.paddingTop = '8px';

        pcIds.forEach(pcId => {
            const plans = pcMap[pcId] || [];
            const asig  = _planAsignaciones.find(a => a.id === pcId);
            if (!asig) return;
            const dots = [1, 2, 3, 4].map(s => {
                const ok = plans.some(p => p.semana === s);
                return `<span class="plan-asig-dot${ok ? '' : ' plan-asig-dot--empty'}"></span>`;
            }).join('');
            const card = document.createElement('div');
            card.className = 'plan-asig-card';
            card.innerHTML = `
                <div>
                    <div class="plan-asig-card__materia">${_escapeHtml(asig.materia_nombre)}</div>
                    <div class="plan-asig-card__curso">${_escapeHtml(asig.curso_nombre)}</div>
                </div>
                <div class="plan-asig-dots">${dots}</div>
                <div class="plan-asig-card__count">${plans.length} de 4 semanas</div>`;
            card.addEventListener('click', () => _abrirPlanModal(pcId, mesNum, false));
            grid.appendChild(card);
        });

        group.appendChild(grid);
        frag.appendChild(group);
    });

    content.innerHTML = '';
    content.appendChild(frag);
}

function _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Historial de citaciones ───────────────────────────────────────
async function cargarHistorial() {
    const tbody   = document.getElementById('tbodyCitaciones');
    const spinner = document.getElementById('historialSpinner');
    const empty   = document.getElementById('historialVacio');

    tbody.innerHTML = '';
    spinner.style.display = 'flex';
    empty.style.display = 'none';

    const { ok, data } = await fetchAPI('/api/discipline/citaciones/');

    spinner.style.display = 'none';

    if (!ok || !data.length) {
        empty.style.display = 'block';
        return;
    }

    data.forEach(c => {
        const asistBadge = ASISTENCIA_BADGES[c.asistencia] || 'badge--neutral';
        const asistLabel = ASISTENCIA_LABELS[c.asistencia] || c.asistencia;
        const fechaEnvio = new Date(c.fecha_envio).toLocaleDateString('es-BO');
        const fechaLim   = c.fecha_limite_asistencia
            ? new Date(c.fecha_limite_asistencia + 'T00:00:00').toLocaleDateString('es-BO')
            : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.estudiante_nombre}</td>
            <td>${c.curso}</td>
            <td>${MOTIVOS[c.motivo] || c.motivo}</td>
            <td><span class="badge ${asistBadge}">${asistLabel}</span></td>
            <td>${fechaLim}</td>
            <td>${fechaEnvio}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Checklist de contraseña en tiempo real ────────────────────────
function _actualizarChecks(password, prefix) {
    const wrap = document.getElementById(`${prefix}PassChecks`);
    if (!wrap) return;
    wrap.classList.toggle('visible', password.length > 0);

    const reglas = [
        { id: `${prefix}Check8`,     fn: v => v.length >= 8 },
        { id: `${prefix}CheckUpper`, fn: v => /[A-Z]/.test(v) },
        { id: `${prefix}CheckLower`, fn: v => /[a-z]/.test(v) },
        { id: `${prefix}CheckNum`,   fn: v => /[0-9]/.test(v) },
        { id: `${prefix}CheckSpec`,  fn: v => /[^a-zA-Z0-9\s]/.test(v) },
        { id: `${prefix}CheckSpace`, fn: v => v.length > 0 && !v.includes(' ') },
    ];
    reglas.forEach(({ id, fn }) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('ok', fn(password));
    });
}

// ── Primer ingreso — modal forzado ────────────────────────────────
function _initPrimerIngreso() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || !user.primer_ingreso) return;

    const overlay = document.getElementById('primerIngresoOverlay');
    overlay.classList.add('visible');

    document.getElementById('piPassNueva').addEventListener('input', e => {
        _actualizarChecks(e.target.value, 'pi');
    });

    document.getElementById('formPrimerIngreso').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl   = document.getElementById('piError');
        const btn     = document.getElementById('btnPrimerIngreso');
        const uNuevo  = document.getElementById('piUsernameNuevo').value.trim();
        const pActual = document.getElementById('piPassActual').value;
        const pNueva  = document.getElementById('piPassNueva').value;

        errEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Guardando…';

        const { ok, data } = await fetchAPI('/api/auth/cambiar-credenciales/', {
            method: 'POST',
            body: JSON.stringify({
                password_actual: pActual,
                username_nuevo:  uNuevo,
                password_nueva:  pNueva,
            }),
        });

        if (!ok) {
            const msg = data?.errores || data?.username_nuevo?.[0] || data?.password_nueva?.[0]
                || 'Error al guardar. Intenta de nuevo.';
            errEl.textContent   = msg;
            errEl.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Guardar y continuar';
            return;
        }

        // Actualizar localStorage con los nuevos datos
        localStorage.setItem('user', JSON.stringify(data.user));
        overlay.classList.remove('visible');

        // Actualizar nombre en sidebar
        const nombre = `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.username;
        document.getElementById('profileName').textContent = nombre;
    });
}

// ── Tab Cuenta — cambiar credenciales voluntario ──────────────────
let _cuentaIniciada = false;

function _initCuentaTab() {
    // Rellenar username actual
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) document.getElementById('cuentaUsernameActual').value = user.username || '';

    if (_cuentaIniciada) return;
    _cuentaIniciada = true;

    document.getElementById('cuentaPassNueva').addEventListener('input', e => {
        _actualizarChecks(e.target.value, 'cuenta');
    });

    document.getElementById('formCuenta').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl   = document.getElementById('cuentaError');
        const uNuevo  = document.getElementById('cuentaUsernameNuevo').value.trim();
        const pActual = document.getElementById('cuentaPassActual').value;
        const pNueva  = document.getElementById('cuentaPassNueva').value;

        errEl.style.display = 'none';

        // Si cambia el username → pedir confirmación primero
        if (uNuevo) {
            document.getElementById('confirmCredUsername').textContent = uNuevo;
            document.getElementById('confirmCredOverlay').classList.add('visible');

            // Esperar decisión del usuario
            await new Promise(resolve => {
                document.getElementById('confirmCredAceptar').onclick = () => {
                    document.getElementById('confirmCredOverlay').classList.remove('visible');
                    resolve(true);
                };
                document.getElementById('confirmCredCancelar').onclick = () => {
                    document.getElementById('confirmCredOverlay').classList.remove('visible');
                    resolve(false);
                };
            }).then(async (confirmado) => {
                if (!confirmado) return;
                await _ejecutarCambioCuenta(uNuevo, pActual, pNueva, errEl);
            });
            return;
        }

        await _ejecutarCambioCuenta(uNuevo, pActual, pNueva, errEl);
    });
}

async function _ejecutarCambioCuenta(uNuevo, pActual, pNueva, errEl) {
    const sucEl = document.getElementById('cuentaSuccess');
    const btn   = document.getElementById('btnGuardarCuenta');

    sucEl.classList.remove('visible');
    btn.disabled    = true;
    btn.textContent = 'Guardando…';

    const { ok, data } = await fetchAPI('/api/auth/cambiar-credenciales/', {
        method: 'POST',
        body: JSON.stringify({
            password_actual: pActual,
            username_nuevo:  uNuevo,
            password_nueva:  pNueva,
        }),
    });

    btn.disabled    = false;
    btn.textContent = 'Guardar cambios';

    if (!ok) {
        const msg = data?.errores || data?.username_nuevo?.[0] || data?.password_nueva?.[0]
            || 'Error al guardar. Revisa los campos.';
        errEl.textContent   = msg;
        errEl.style.display = 'block';
        return;
    }

    localStorage.setItem('user', JSON.stringify(data.user));
    document.getElementById('cuentaUsernameActual').value = data.user.username;
    document.getElementById('cuentaUsernameNuevo').value  = '';
    document.getElementById('cuentaPassActual').value     = '';
    document.getElementById('cuentaPassNueva').value      = '';
    _actualizarChecks('', 'cuenta');

    const nombre = `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim() || data.user.username;
    document.getElementById('profileName').textContent = nombre;

    sucEl.classList.add('visible');
    setTimeout(() => sucEl.classList.remove('visible'), 4000);
}
