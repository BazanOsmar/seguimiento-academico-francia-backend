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
    cargarCursos();
    _verificarDotPlan();  // dot de notificación en background
});

// ── Tabs ──────────────────────────────────────────────────────────
const _TABS = ['panelNotas', 'panelCitaciones', 'panelPlan'];
const _TAB_BTNS = { panelNotas: 'sideNotas', panelCitaciones: 'sideCitaciones', panelPlan: 'sidePlan' };

function _activarTab(panelId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');
    _TABS.forEach(id => {
        const btn = document.getElementById(_TAB_BTNS[id]);
        if (btn) btn.classList.toggle('active', id === panelId);
    });
    if (panelId === 'panelCitaciones') cargarHistorial();
    if (panelId === 'panelPlan') cargarPlanes();
}

function _initTabs() {
    document.getElementById('sideNotas').addEventListener('click', () => _activarTab('panelNotas'));
    document.getElementById('sideCitaciones').addEventListener('click', () => _activarTab('panelCitaciones'));
    document.getElementById('sidePlan').addEventListener('click', () => _activarTab('panelPlan'));
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

function _initPlanForm() {
    const selMes    = document.getElementById('planMes');
    const meActual  = new Date().getMonth() + 1;

    // Solo mostrar meses hasta el actual
    selMes.innerHTML = '';
    for (let m = 1; m <= meActual; m++) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = MESES[m];
        selMes.appendChild(opt);
    }
    selMes.value = meActual;
    selMes.addEventListener('change', cargarPlanes);
}

// Calcula fechas y texto de período para una semana de un mes
function _periodoSemana(mes, semana) {
    const año = new Date().getFullYear();
    const diasEnMes = new Date(año, mes, 0).getDate();
    const rangos = { 1: [1, 7], 2: [8, 14], 3: [15, 21], 4: [22, diasEnMes] };
    const [d1, d2] = rangos[semana];
    const pad = n => String(n).padStart(2, '0');
    const fi = `${año}-${pad(mes)}-${pad(d1)}`;
    const ff = `${año}-${pad(mes)}-${pad(d2)}`;
    const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
    return { fi, ff, display: `${fmt(fi)} – ${fmt(ff)}` };
}

// Deriva la semana (1-4) del día de fecha_inicio
function _semanaDesde(fechaInicio) {
    const dia = parseInt(fechaInicio.split('-')[2]);
    if (dia <= 7)  return 1;
    if (dia <= 14) return 2;
    if (dia <= 21) return 3;
    return 4;
}

async function cargarPlanes() {
    const wrap    = document.getElementById('planTableWrap');
    const spinner = document.getElementById('planSpinner');
    wrap.style.display = 'none';
    spinner.style.display = 'flex';

    const mes      = parseInt(document.getElementById('planMes').value);
    const mesActual = new Date().getMonth() + 1;
    const { ok, data } = await fetchAPI(`/api/academics/profesor/planes/?mes=${mes}`);

    spinner.style.display = 'none';
    if (!ok) { showAppToast('error', 'Error', 'No se pudieron cargar los planes.'); return; }

    _renderPlanTable(data, mes, mes === mesActual);
    _actualizarNotificaciones(data, mes, mesActual);
    wrap.style.display = 'block';
}

// Verifica el mes actual en background (para el dot al cargar la app)
async function _verificarDotPlan() {
    const mesActual = new Date().getMonth() + 1;
    const { ok, data } = await fetchAPI(`/api/academics/profesor/planes/?mes=${mesActual}`);
    if (!ok) return;
    const incompleto = data.length < 4;
    document.getElementById('planDot').classList.toggle('visible', incompleto);
}

function _actualizarNotificaciones(planes, mes, mesActual) {
    const dot          = document.getElementById('planDot');
    const banner       = document.getElementById('planBanner');
    const bannerMes    = document.getElementById('planBannerMes');
    const readonlyBadge = document.getElementById('planReadonlyBadge');
    const esActual     = mes === mesActual;
    const incompleto   = planes.length < 4;

    // El dot solo refleja el mes actual
    if (esActual) dot.classList.toggle('visible', incompleto);

    // Banner solo cuando estamos en el mes actual e incompleto
    banner.classList.toggle('visible', esActual && incompleto);
    if (esActual && incompleto) bannerMes.textContent = MESES[mesActual];

    // Badge solo lectura para meses pasados
    readonlyBadge.classList.toggle('visible', !esActual);
}

function _renderPlanTable(planes, mes, editable) {
    const tbody = document.getElementById('planTbody');
    tbody.innerHTML = '';

    // Mapear semana → plan
    const mapa = {};
    planes.forEach(p => { mapa[_semanaDesde(p.fecha_inicio)] = p; });

    for (let semana = 1; semana <= 4; semana++) {
        const plan = mapa[semana] || null;
        const { display } = _periodoSemana(mes, semana);
        const tr = document.createElement('tr');
        if (!editable) tr.classList.add('plan-row--locked');

        const dotCls = plan ? 'plan-semana-dot' : 'plan-semana-dot plan-semana-dot--empty';
        const semanaCell = `<td data-label="Semana">
            <span class="plan-semana-badge">
                <span class="${dotCls}"></span>Semana ${semana}
            </span>
        </td>`;
        const periodoCell = `<td data-label="Período"><span class="plan-periodo">${display}</span></td>`;

        if (plan) {
            tr.innerHTML = `
                ${semanaCell}
                ${periodoCell}
                <td data-label="Plan de Trabajo">
                    <span class="plan-desc-text">${_escapeHtml(plan.descripcion)}</span>
                </td>
                <td>${editable ? `<button class="btn-icon-sm" title="Eliminar plan">${SVG_TRASH}</button>` : ''}</td>`;
            if (editable) tr.querySelector('.btn-icon-sm').addEventListener('click', () => eliminarPlan(plan.id));
        } else {
            tr.innerHTML = `
                ${semanaCell}
                ${periodoCell}
                <td data-label="Plan de Trabajo">
                    <span class="plan-desc-vacia">${editable ? 'Sin plan registrado' : '—'}</span>
                </td>
                <td>${editable ? `<button class="plan-btn-add">+ Agregar</button>` : ''}</td>`;
            if (editable) tr.querySelector('.plan-btn-add').addEventListener('click', () => _mostrarFormInline(tr, semana, mes));
        }
        tbody.appendChild(tr);
    }
}

function _mostrarFormInline(tr, semana, mes) {
    const descCell   = tr.querySelectorAll('td')[2];
    const actionCell = tr.querySelectorAll('td')[3];

    descCell.innerHTML = `
        <div class="plan-inline-form">
            <textarea placeholder="Escribe el plan de trabajo para esta semana…"
                      maxlength="500"></textarea>
            <span class="plan-inline-error"></span>
        </div>`;
    actionCell.innerHTML = `
        <div class="plan-inline-btns">
            <button class="plan-btn-save">Guardar</button>
            <button class="plan-btn-cancel">Cancelar</button>
        </div>`;

    const textarea = descCell.querySelector('textarea');
    const errorEl  = descCell.querySelector('.plan-inline-error');
    const saveBtn  = actionCell.querySelector('.plan-btn-save');
    textarea.focus();

    actionCell.querySelector('.plan-btn-cancel').addEventListener('click', cargarPlanes);

    saveBtn.addEventListener('click', async () => {
        const desc = textarea.value.trim();
        errorEl.style.display = 'none';
        textarea.classList.remove('invalid');

        if (!desc) {
            errorEl.textContent = 'Escribe el plan antes de guardar.';
            errorEl.style.display = 'block';
            textarea.classList.add('invalid');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando…';

        const { ok, data } = await fetchAPI('/api/academics/profesor/planes/', {
            method: 'POST',
            body: JSON.stringify({ mes, semana, descripcion: desc }),
        });

        if (!ok) {
            errorEl.textContent = data?.errores || 'Error al guardar.';
            errorEl.style.display = 'block';
            textarea.classList.add('invalid');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar';
            return;
        }

        showAppToast('success', 'Plan guardado', `Semana ${semana} — ${MESES[mes]}`);
        await cargarPlanes();
    });
}

async function eliminarPlan(id) {
    const { ok } = await fetchAPI(`/api/academics/profesor/planes/${id}/`, { method: 'DELETE' });
    if (!ok) { showAppToast('error', 'Error', 'No se pudo eliminar el plan.'); return; }
    showAppToast('success', 'Eliminado', 'Plan eliminado correctamente.');
    await cargarPlanes();
}

function _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
