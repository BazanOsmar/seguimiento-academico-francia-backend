'use strict';

const ASISTENCIA_LABEL = {
    PENDIENTE:  'Pendiente',
    ASISTIO:    'Asistio',
    NO_ASISTIO: 'No asistio',
    ATRASO:     'Atraso',
    ANULADA:    'Anulada',
};
const ASISTENCIA_CLASS = {
    PENDIENTE:  'badge--warning',
    ASISTIO:    'badge--success',
    NO_ASISTIO: 'badge--danger',
    ATRASO:     'badge--warning',
    ANULADA:    'badge--default',
};

let _activo     = true;
let _estudiante = null;

function renderEstado(activo) {
    document.getElementById('pActivo').innerHTML = activo
        ? '<span class="badge badge--success">Activo</span>'
        : '<span class="badge badge--danger">Inactivo</span>';

    const btn = document.getElementById('btnCambiarEstado');
    btn.style.display = '';
    if (activo) {
        btn.className   = 'btn-baja';
        btn.textContent = 'Dar de baja al estudiante';
    } else {
        btn.className   = 'btn-reactivar';
        btn.textContent = 'Reactivar estudiante';
    }
}

function fmtFecha(str) {
    if (!str) return '-';
    const [y, m, d] = String(str).slice(0, 10).split('-');
    if (!y || !m || !d) return '-';
    return `${d}/${m}/${y}`;
}

function fmtFechaTexto(str) {
    const f = _parseFechaLocalPerfil(str);
    if (!f) return '-';
    return f.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

let _todasCitaciones = [];
let _filtroActivo    = 'todos';
let _filtroEstadoCit = 'ACTIVO';
let _citMes          = new Date().toISOString().slice(0, 7); // "YYYY-MM"
let _citPage         = 1;
const _CIT_PER_PAGE  = 10;

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _citMesLabel(mes) {
    const [y, m] = mes.split('-');
    return `${MESES_ES[Number(m) - 1]} ${y}`;
}

function _citacionesDelMes() {
    return _todasCitaciones.filter(c => c.fecha_envio && c.fecha_envio.slice(0, 7) === _citMes);
}

function _citacionesBaseFiltradas() {
    const delMes = _citacionesDelMes();
    if (_filtroEstadoCit === 'ANULADA') {
        return delMes.filter(c => c.asistencia === 'ANULADA');
    }
    return delMes.filter(c => c.asistencia !== 'ANULADA');
}

function _parseFechaLocalPerfil(str) {
    if (!str) return null;
    const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function _inicioHoyPerfil() {
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    return h;
}

function _citacionVencida(c) {
    if (c.asistencia !== 'PENDIENTE') return false;
    const limite = _parseFechaLocalPerfil(c.fecha_limite_asistencia);
    return Boolean(limite && limite < _inicioHoyPerfil());
}

function _claseLimitePerfil(c) {
    const inicio = _parseFechaLocalPerfil(c.fecha_envio);
    const limite = _parseFechaLocalPerfil(c.fecha_limite_asistencia);
    const hoy = _inicioHoyPerfil();
    if (!inicio || !limite) return 'neutral';
    if (hoy >= limite) return 'danger';
    const total = Math.max(1, limite - inicio);
    const transcurrido = Math.max(0, hoy - inicio);
    return (transcurrido / total) >= 0.5 ? 'warn' : 'ok';
}

function _limitePerfilHTML(c) {
    const cls = _claseLimitePerfil(c);
    return `<span class="perfil-cit-limit perfil-cit-limit--${cls}">${_escPE(fmtFecha(c.fecha_limite_asistencia))}</span>`;
}

function _estadoBadgeCitPerfil(asist) {
    const key = asist || 'PENDIENTE';
    const cfg = {
        PENDIENTE:  { cls: 'estado-badge--pendiente', txt: 'Pendiente' },
        ASISTIO:    { cls: 'estado-badge--asistio', txt: 'Asistio' },
        NO_ASISTIO: { cls: 'estado-badge--no_asistio', txt: 'No asistio' },
        ATRASO:     { cls: 'estado-badge--atraso', txt: 'Atraso' },
        ANULADA:    { cls: 'estado-badge--anulada', txt: 'Anulada' },
    }[key] || { cls: 'estado-badge--pendiente', txt: key };
    return `<span class="estado-badge ${cfg.cls}">${_escPE(cfg.txt)}</span>`;
}

const FILTROS = {
    todos:      () => true,
    pendiente:  c => c.asistencia === 'PENDIENTE',
    vencidas:   c => _citacionVencida(c),
    asistencia: c => ['ASISTIO', 'ATRASO', 'NO_ASISTIO', 'VISTO'].includes(c.asistencia),
};
const FILTRO_EMPTY = {
    todos:      'Sin citaciones este mes.',
    pendiente:  'Sin citaciones pendientes este mes.',
    vencidas:   'Sin citaciones vencidas este mes.',
    asistencia: 'Sin citaciones con asistencia registrada este mes.',
};

const CIT_TAB_CLASS = { todos: 'asistencia', pendiente: 'pendiente', vencidas: 'vencida', asistencia: 'asistencia' };

function _citItemClass(asistencia) {
    if (asistencia === 'PENDIENTE') return 'pendiente';
    if (asistencia === 'VENCIDA')   return 'vencida';
    return 'asistencia';
}

function renderCitaciones(lista) {
    _todasCitaciones = lista;
    document.getElementById('citMesLabel').textContent = _citMesLabel(_citMes);
    _actualizarContadores();
    renderFiltro(_filtroActivo);
}

function _actualizarContadores() {
    const delMes = _citacionesBaseFiltradas();
    document.getElementById('citTotalBadge').textContent   = `${delMes.length} TOTAL`;
    document.getElementById('countTodos').textContent      = delMes.length;
    document.getElementById('countPendiente').textContent  = delMes.filter(FILTROS.pendiente).length;
    document.getElementById('countVencidas').textContent   = delMes.filter(FILTROS.vencidas).length;
    document.getElementById('countAsistencia').textContent = delMes.filter(FILTROS.asistencia).length;
}

function renderFiltro(filtro) {
    _filtroActivo = filtro;
    _citPage = 1;
    _renderPaginaCit();
}

function _renderPaginaCit() {
    const cont  = document.getElementById('citacionesContainer');
    const base  = _citacionesBaseFiltradas();
    const lista = base.filter(FILTROS[_filtroActivo]);
    const total = lista.length;

    if (!total) {
        const empty = _filtroEstadoCit === 'ANULADA' && _filtroActivo === 'todos'
            ? 'Sin citaciones anuladas este mes.'
            : FILTRO_EMPTY[_filtroActivo];
        cont.innerHTML = `<p class="cit-empty">${empty}</p>`;
        return;
    }

    const paginas = Math.ceil(total / _CIT_PER_PAGE);
    const desde   = (_citPage - 1) * _CIT_PER_PAGE;
    const pagina  = lista.slice(desde, desde + _CIT_PER_PAGE);

    cont.innerHTML = `
        <div class="perfil-cit-table-wrap">
            <table class="perfil-cit-table">
                <thead>
                    <tr>
                        <th>Tipo usuario</th>
                        <th>Nombre emisor</th>
                        <th>Motivo</th>
                        <th>Fecha envio</th>
                        <th>Limite asistencia</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${pagina.map(c => {
                        const statusKey = c.asistencia || 'PENDIENTE';
                        const statusCls = String(statusKey).toLowerCase();
                        const label = ASISTENCIA_LABEL[statusKey] || statusKey;
                        return `
                            <tr data-cit-id="${c.id}">
                                <td><span class="perfil-cit-type">${_escPE(c.emisor_tipo || 'Sin tipo')}</span></td>
                                <td>
                                    <div class="perfil-cit-main">${_escPE(c.emisor_nombre || c.emitido_por_nombre || 'Sin emisor')}</div>
                                    ${c.materia_nombre ? `<div class="perfil-cit-muted">${_escPE(c.materia_nombre)}</div>` : ''}
                                </td>
                                <td>
                                    <div class="perfil-cit-main">${_escPE(c.motivo || 'Sin motivo')}</div>
                                </td>
                                <td>${_escPE(fmtFecha(c.fecha_envio))}</td>
                                <td>${_limitePerfilHTML(c)}</td>
                                <td><span class="perfil-cit-status perfil-cit-status--${statusCls}">${_escPE(label)}</span></td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

    if (paginas > 1) {
        const pag = document.createElement('div');
        pag.className = 'cit-paginacion';
        pag.innerHTML = `
            <button class="cit-pag-btn" id="citPagPrev" ${_citPage === 1 ? 'disabled' : ''}>‹ Anterior</button>
            <span class="cit-pag-info">${_citPage} / ${paginas}</span>
            <button class="cit-pag-btn" id="citPagNext" ${_citPage === paginas ? 'disabled' : ''}>Siguiente ›</button>`;
        pag.querySelector('#citPagPrev').addEventListener('click', () => { _citPage--; _renderPaginaCit(); });
        pag.querySelector('#citPagNext').addEventListener('click', () => { _citPage++; _renderPaginaCit(); });
        cont.appendChild(pag);
    }

    cont.querySelectorAll('tr[data-cit-id]').forEach(row => {
        row.addEventListener('click', () => abrirModalDetalleCitacionPerfil(row.dataset.citId));
    });
}

/* Navegación por mes */
const _citAnioActual = new Date().getFullYear();
const _citMesActual  = new Date().toISOString().slice(0, 7); // "YYYY-MM" de hoy

function _actualizarBotonesCitMes() {
    const [y, m] = _citMes.split('-').map(Number);
    document.getElementById('citMesPrev').disabled = (y === _citAnioActual && m === 1);
    document.getElementById('citMesNext').disabled = (_citMes >= _citMesActual);
}

document.getElementById('citMesPrev').addEventListener('click', () => {
    const [y, m] = _citMes.split('-').map(Number);
    if (y === _citAnioActual && m === 1) return;
    const prev = new Date(y, m - 2, 1);
    _citMes = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('citMesLabel').textContent = _citMesLabel(_citMes);
    _actualizarBotonesCitMes();
    _actualizarContadores();
    renderFiltro(_filtroActivo);
});
document.getElementById('citMesNext').addEventListener('click', () => {
    if (_citMes >= _citMesActual) return;
    const [y, m] = _citMes.split('-').map(Number);
    const next = new Date(y, m, 1);
    _citMes = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('citMesLabel').textContent = _citMesLabel(_citMes);
    _actualizarBotonesCitMes();
    _actualizarContadores();
    renderFiltro(_filtroActivo);
});

// Tabs
document.querySelectorAll('.cit-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.cit-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderFiltro(tab.dataset.filtro);
    });
});

document.querySelectorAll('#citEstadoChips .cit-state-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('#citEstadoChips .cit-state-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _filtroEstadoCit = chip.dataset.estado || 'ACTIVO';
        _citPage = 1;
        _actualizarContadores();
        _renderPaginaCit();
    });
});

const _modalDetalleCitPerfil = document.getElementById('modalDetalleCitacionPerfil');
const _modalDetalleCitPerfilContenido = document.getElementById('modalDetalleCitacionPerfilContenido');
let _citAnularIdPerfil = null;

function cerrarModalDetalleCitacionPerfil() {
    _modalDetalleCitPerfil.classList.remove('visible');
    _citAnularIdPerfil = null;
}

document.getElementById('btnCerrarDetalleCitacionPerfil').addEventListener('click', cerrarModalDetalleCitacionPerfil);
_modalDetalleCitPerfil.addEventListener('click', e => {
    if (e.target === _modalDetalleCitPerfil) cerrarModalDetalleCitacionPerfil();
});

_modalDetalleCitPerfil.addEventListener('click', async e => {
    const id = e.target.id;

    if (id === 'btnIniciarAnularCitPerfil') {
        e.target.style.display = 'none';
        document.getElementById('anularCitPerfilForm').style.display = 'block';
        document.getElementById('anularCitPerfilPass').focus();
        return;
    }

    if (id === 'btnCancelarAnularCitPerfil') {
        document.getElementById('anularCitPerfilForm').style.display = 'none';
        document.getElementById('btnIniciarAnularCitPerfil').style.display = 'block';
        document.getElementById('anularCitPerfilPass').value = '';
        document.getElementById('anularCitPerfilError').style.display = 'none';
        return;
    }

    if (id === 'btnConfirmarAnularCitPerfil') {
        const passInput = document.getElementById('anularCitPerfilPass');
        const errEl     = document.getElementById('anularCitPerfilError');
        const contrasena = passInput.value;
        if (!contrasena) {
            errEl.textContent   = 'Ingresa tu contraseña.';
            errEl.style.display = 'block';
            passInput.focus();
            return;
        }
        e.target.disabled    = true;
        e.target.textContent = 'Anulando...';
        errEl.style.display  = 'none';

        const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${_citAnularIdPerfil}/anular/`, {
            method: 'PATCH',
            body:   JSON.stringify({ contrasena }),
        });

        if (ok) {
            cerrarModalDetalleCitacionPerfil();
            showAppToast('success', 'Citación anulada', 'La citación fue anulada correctamente.');
            const res = await fetchAPI(`/api/discipline/citaciones/?estudiante_id=${ESTUDIANTE_ID}`);
            if (res.ok) renderCitaciones(Array.isArray(res.data) ? res.data : []);
        } else {
            errEl.textContent    = data?.errores || 'Error al anular.';
            errEl.style.display  = 'block';
            e.target.disabled    = false;
            e.target.textContent = 'Confirmar';
        }
    }
});

async function abrirModalDetalleCitacionPerfil(id) {
    _citAnularIdPerfil = id;
    _modalDetalleCitPerfilContenido.innerHTML = `
        <div class="modal-det__body">
            <div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px;">
                <div class="table-spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div> Cargando...
            </div>
        </div>`;
    _modalDetalleCitPerfil.classList.add('visible');

    const res = await fetchAPI(`/api/discipline/citaciones/${id}/`);
    if (!res.ok) {
        _modalDetalleCitPerfilContenido.innerHTML = '<div class="modal-det__body"><p style="font-size:12px;color:var(--danger);margin:0;">No se pudo cargar el detalle.</p></div>';
        return;
    }

    const d = res.data || {};
    const asist = d.asistencia || 'PENDIENTE';
    const motivo = d.motivo || 'Sin motivo';
    const descripcion = d.motivo_descripcion || d.descripcion || 'Sin descripcion';

    _modalDetalleCitPerfilContenido.innerHTML = `
        <div class="modal-det__hero modal-det__hero--${_escPE(asist)}">
            <p class="modal-det__nombre">${_escPE(d.estudiante_nombre || 'Estudiante')}</p>
            <div class="modal-det__sub">
                <span class="badge-curso">${_escPE(d.curso || 'Sin curso')}</span>
                <span class="citacion-card__motivo citacion-card__motivo--${_escPE(String(motivo).toUpperCase())}">${_escPE(motivo)}</span>
                ${_estadoBadgeCitPerfil(asist)}
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(148,163,184,.12);color:var(--text-muted);">Enviada</span>
            </div>
        </div>
        <div class="modal-det__body">
            <div class="modal-det__info-grid">
                <div class="modal-det__info-item">
                    <p class="modal-det__info-label">Emitido por</p>
                    <p class="modal-det__info-val">${_escPE(d.emitido_por_nombre || 'Sin emisor')}</p>
                    <p style="font-size:.72rem;color:var(--text-muted);margin:2px 0 0;">${_escPE(d.emitido_por_cargo || d.emisor_tipo || '')}</p>
                </div>
                <div class="modal-det__info-item">
                    <p class="modal-det__info-label">Tutor registrado</p>
                    <p class="modal-det__info-val">${_escPE(d.tutor_nombre || 'Sin tutor')}</p>
                </div>
            </div>
            <div class="modal-det__desc">
                <p class="modal-det__desc-label">Descripción</p>
                <p class="modal-det__desc-text">${_escPE(descripcion)}</p>
            </div>
            <div class="modal-det__dates">
                <div class="modal-det__date-item">
                    <span class="modal-det__date-label">Fecha de envío</span>
                    <span class="modal-det__date-val">${_escPE(fmtFechaTexto(d.fecha_envio))}</span>
                </div>
                <div class="modal-det__date-item">
                    <span class="modal-det__date-label">Fecha límite</span>
                    <span class="modal-det__date-val">${_escPE(fmtFechaTexto(d.fecha_limite_asistencia))}</span>
                </div>
            </div>
        </div>
        ${asist === 'PENDIENTE' ? `
        <div class="modal-det__footer">
            <button class="btn-modal-anular" id="btnIniciarAnularCitPerfil">Anular citación</button>
            <div id="anularCitPerfilForm" style="display:none;margin-top:10px;">
                <input type="password" id="anularCitPerfilPass" placeholder="Tu contraseña" maxlength="64"
                    style="width:100%;padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:.85rem;box-sizing:border-box;" />
                <p id="anularCitPerfilError" style="display:none;color:var(--danger);font-size:.78rem;margin:6px 0 0;"></p>
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <button id="btnCancelarAnularCitPerfil" style="flex:1;height:36px;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text-muted);font-size:.82rem;cursor:pointer;">Cancelar</button>
                    <button id="btnConfirmarAnularCitPerfil" style="flex:1;height:36px;border-radius:var(--radius-sm);border:1px solid rgba(239,68,68,.42);background:rgba(239,68,68,.08);color:#f87171;font-size:.82rem;font-weight:800;cursor:pointer;">Confirmar</button>
                </div>
            </div>
        </div>` : ''}
        </div>`;
}

async function toggleCitacion(item) {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('#citacionesContainer .cit-item.open').forEach(i => i.classList.remove('open'));
    if (isOpen) return;

    item.classList.add('open');
    const detail = item.querySelector('.cit-detail');
    if (detail.dataset.loaded) return;

    const res = await fetchAPI(`/api/discipline/citaciones/${item.dataset.citId}/`);
    detail.dataset.loaded = '1';

    if (!res.ok) {
        detail.innerHTML = '<div class="cit-detail-inner"><p style="font-size:12px;color:var(--danger);">No se pudo cargar el detalle.</p></div>';
        return;
    }
    const d = res.data;
    detail.innerHTML = `
        <div class="cit-detail-inner">
            <div class="cit-detail-grid">
                <div class="cit-di">
                    <span class="cit-di__label">Emitido por</span>
                    <span class="cit-di__value">${d.emitido_por_nombre || '—'}</span>
                </div>
                <div class="cit-di">
                    <span class="cit-di__label">Cargo</span>
                    <span class="cit-di__value">${d.emitido_por_cargo || '—'}</span>
                </div>
                <div class="cit-di">
                    <span class="cit-di__label">Tutor</span>
                    <span class="cit-di__value">${d.tutor_nombre || 'Sin tutor'}</span>
                </div>
                <div class="cit-di">
                    <span class="cit-di__label">Fecha límite</span>
                    <span class="cit-di__value">${fmtFecha(d.fecha_limite_asistencia)}</span>
                </div>
                <div class="cit-di cit-di--full">
                    <span class="cit-di__label">Descripción</span>
                    <div class="cit-desc-box">${d.motivo_descripcion || '<em style="color:var(--text-muted)">Sin descripción</em>'}</div>
                </div>
                ${d.actualizado_por_nombre ? `
                <div class="cit-di cit-di--full">
                    <span class="cit-di__label">Actualizado por</span>
                    <span class="cit-di__value cit-di__value--muted">${d.actualizado_por_nombre}</span>
                </div>` : ''}
            </div>
        </div>`;
}

/* ── Calendario de asistencia ──────────────────────────── */
let _calMes = new Date().toISOString().slice(0, 7); // "YYYY-MM"

const _BOX_CLASS  = { PRESENTE: 'cal-day-box--presente', FALTA: 'cal-day-box--falta', ATRASO: 'cal-day-box--atraso', LICENCIA: 'cal-day-box--licencia' };
const _DOT_LABEL  = { PRESENTE: 'Presente', FALTA: 'Falta', ATRASO: 'Retraso', LICENCIA: 'Licencia' };

function _calSkeleton() {
    document.getElementById('perfilCalMesLabel').textContent = '...';
    document.getElementById('perfilCalGrid').innerHTML =
        Array(35).fill(0).map(() =>
            `<div class="cal-cell"><div class="cal-skeleton"></div></div>`
        ).join('');
}

async function loadCalendario() {
    _calSkeleton();
    const { ok, data } = await fetchAPI(
        `/api/attendance/estudiantes/${ESTUDIANTE_ID}/calendario/?mes=${_calMes}`
    );
    if (!ok || !data) return;

    document.getElementById('perfilCalMesLabel').textContent = data.mes_nombre;

    const [year, month] = data.mes.split('-').map(Number);
    const hoyISO  = new Date().toISOString().split('T')[0];
    const lastDay = new Date(year, month, 0).getDate();

    const diaMap = {};
    for (const a of data.asistencias) diaMap[a.fecha] = { estado: a.estado, sin_uniforme: a.sin_uniforme };

    let startDow = new Date(year, month - 1, 1).getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    let html = '';
    for (let i = 0; i < startDow; i++) html += '<div class="cal-cell cal-cell--empty"></div>';

    for (let d = 1; d <= lastDay; d++) {
        const dateStr   = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const info      = diaMap[dateStr];
        const estado    = info?.estado;
        const isToday   = dateStr === hoyISO;
        const isFuture  = dateStr > hoyISO;

        let dayHtml      = '';
        let uniformeHtml = '';
        let title        = 'Sin registro';

        if (estado) {
            const boxCls = _BOX_CLASS[estado] || '';
            dayHtml = `<span class="cal-day-box ${boxCls}">${d}</span>`;
            title   = _DOT_LABEL[estado] || estado;

            if (estado === 'PRESENTE' || estado === 'ATRASO') {
                uniformeHtml = info.sin_uniforme
                    ? `<span class="cal-dot cal-dot--sin-uniforme" title="Sin uniforme"></span>`
                    : `<span class="cal-dot cal-dot--con-uniforme" title="Con uniforme"></span>`;
                title += info.sin_uniforme ? ' · Sin uniforme' : ' · Con uniforme';
            }
        } else {
            dayHtml = `<span class="cal-day-num">${d}</span>`;
        }

        const classes = ['cal-cell', isToday ? 'cal-cell--today' : '', isFuture ? 'cal-cell--future' : ''].filter(Boolean).join(' ');
        html += `<div class="${classes}" title="${title}">${dayHtml}${uniformeHtml}</div>`;
    }

    document.getElementById('perfilCalGrid').innerHTML = html;
}

const _anioActual = new Date().getFullYear();

function _actualizarBotonesCalendario() {
    const [y, m] = _calMes.split('-').map(Number);
    document.getElementById('perfilCalPrev').disabled = (y === _anioActual && m === 1);
    document.getElementById('perfilCalNext').disabled = (y === _anioActual && m === 12);
}

document.getElementById('perfilCalPrev').addEventListener('click', () => {
    const [y, m] = _calMes.split('-').map(Number);
    if (y === _anioActual && m === 1) return;
    const prev = new Date(y, m - 2, 1);
    _calMes = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    _actualizarBotonesCalendario();
    loadCalendario();
});

document.getElementById('perfilCalNext').addEventListener('click', () => {
    const [y, m] = _calMes.split('-').map(Number);
    if (y === _anioActual && m === 12) return;
    const next = new Date(y, m, 1);
    _calMes = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    _actualizarBotonesCalendario();
    loadCalendario();
});

/* ── Gestión de Tutor ────────────────────────────────────── */

function _renderTutor(d) {
    const lista   = document.getElementById('tutorFieldList');
    const acciones = document.getElementById('tutorAcciones');
    if (d.tutor_nombre) {
        document.getElementById('pTutorNombre').textContent   = d.tutor_nombre;
        document.getElementById('pTutorUsername').textContent = d.tutor_username || '—';
        acciones.innerHTML = `
            <button class="btn-tutor-accion btn-tutor-accion--danger" id="btnDesvinculatTutor">Desvincular</button>
            <button class="btn-tutor-accion" id="btnReasignarTutor">Reasignar</button>`;
        document.getElementById('btnDesvinculatTutor').addEventListener('click', () => _abrirConfirmTutor('desvincular'));
        document.getElementById('btnReasignarTutor').addEventListener('click',   () => _abrirModalBusqueda('reasignar'));
    } else {
        lista.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;margin:0;padding:4px 0;">Sin tutor asignado aún.</p>';
        lista.insertAdjacentHTML('beforeend', '<div class="tutor-acciones" id="tutorAcciones"></div>');
        document.getElementById('tutorAcciones').innerHTML =
            `<button class="btn-tutor-accion" id="btnAsignarTutor">Asignar tutor</button>`;
        document.getElementById('btnAsignarTutor').addEventListener('click', () => _abrirModalBusqueda('asignar'));
    }
}

// ── Modal búsqueda tutor ──────────────────────────────────
let _tutorSeleccionado  = null;
let _modalTutorAccion   = null; // 'asignar' | 'reasignar'
let _searchTimer        = null;

const _modalTutorBackdrop = document.getElementById('modalTutorBackdrop');
const _tutorSearchInput   = document.getElementById('tutorSearchInput');
const _tutorSearchResults = document.getElementById('tutorSearchResults');
const _modalTutorPassword = document.getElementById('modalTutorPassword');
const _modalTutorPassErr  = document.getElementById('modalTutorPasswordError');
const _btnTutorGuardar    = document.getElementById('btnModalTutorGuardar');

function _abrirModalBusqueda(accion) {
    _tutorSeleccionado  = null;
    _modalTutorAccion   = accion;
    _tutorSearchInput.value   = '';
    _modalTutorPassword.value = '';
    _modalTutorPassErr.textContent = '';
    _modalTutorPassErr.style.display = 'none';
    _tutorSearchResults.innerHTML = '<p class="tutor-search-empty">Escribe para buscar tutores.</p>';
    _btnTutorGuardar.disabled = true;
    document.getElementById('modalTutorTitle').textContent = accion === 'asignar' ? 'Asignar tutor' : 'Reasignar tutor';
    _modalTutorBackdrop.classList.add('visible');
    setTimeout(() => _tutorSearchInput.focus(), 50);
}

function _cerrarModalTutor() {
    _modalTutorBackdrop.classList.remove('visible');
    clearTimeout(_searchTimer);
}

_tutorSearchInput.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = _tutorSearchInput.value.trim();
    if (q.length < 2) {
        _tutorSearchResults.innerHTML = '<p class="tutor-search-empty">Escribe al menos 2 caracteres.</p>';
        return;
    }
    _searchTimer = setTimeout(async () => {
        _tutorSearchResults.innerHTML = '<p class="tutor-search-empty">Buscando…</p>';
        const { ok, data } = await fetchAPI(`/api/users/?q=${encodeURIComponent(q)}`);
        const tutores = ok ? (data?.usuarios || []).filter(u => u.rol === 'Tutor') : [];
        if (!tutores.length) {
            _tutorSearchResults.innerHTML = '<p class="tutor-search-empty">Sin resultados.</p>';
            return;
        }
        _tutorSearchResults.innerHTML = tutores.map(t => {
            const nombre = `${t.first_name} ${t.last_name}`.trim() || t.username;
            return `<div class="tutor-result-item" data-id="${t.id}" data-nombre="${_escPE(nombre)}" data-user="${_escPE(t.username)}">
                <div>
                    <div class="tutor-result-item__name">${_escPE(nombre)}</div>
                    <div class="tutor-result-item__meta">@${_escPE(t.username)}</div>
                </div>
            </div>`;
        }).join('');
        _tutorSearchResults.querySelectorAll('.tutor-result-item').forEach(item => {
            item.addEventListener('click', () => {
                _tutorSearchResults.querySelectorAll('.tutor-result-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                _tutorSeleccionado = { id: Number(item.dataset.id), nombre: item.dataset.nombre, username: item.dataset.user };
                _btnTutorGuardar.disabled = false;
            });
        });
    }, 350);
});

_btnTutorGuardar.addEventListener('click', async () => {
    if (!_tutorSeleccionado) return;
    const pwd = _modalTutorPassword.value.trim();
    if (!pwd) {
        _modalTutorPassErr.textContent = 'Ingresa tu contraseña.';
        _modalTutorPassErr.style.display = 'block';
        _modalTutorPassword.focus();
        return;
    }
    _btnTutorGuardar.disabled = true;
    const { ok, status, data } = await fetchAPI(`/api/students/${ESTUDIANTE_ID}/`, {
        method: 'PATCH',
        body: JSON.stringify({ tutor_id: _tutorSeleccionado.id, password: pwd }),
    });
    _btnTutorGuardar.disabled = false;
    if (!ok) {
        _modalTutorPassErr.textContent = status === 403 ? 'Contraseña incorrecta.' : (data?.errores || 'Error al guardar.');
        _modalTutorPassErr.style.display = 'block';
        return;
    }
    _estudiante = data;
    _cerrarModalTutor();
    _renderTutor(data);
});

document.getElementById('btnModalTutorCancelar').addEventListener('click', _cerrarModalTutor);
_modalTutorBackdrop.addEventListener('click', e => { if (e.target === _modalTutorBackdrop) _cerrarModalTutor(); });

// ── Confirmar desvincular tutor (reutiliza confirmBackdrop) ───
function _abrirConfirmTutor(accion) {
    const pwd   = document.getElementById('confirmPassword');
    const err   = document.getElementById('confirmPasswordError');
    const title = document.getElementById('confirmTitle');
    const desc  = document.getElementById('confirmDesc');
    const btn   = document.getElementById('btnConfirmAceptar');
    const icon  = document.getElementById('confirmIcon');

    pwd.value = '';
    err.textContent = '';
    err.style.display = 'none';
    icon.style.background = 'rgba(239,68,68,.12)';
    icon.style.color = '#ef4444';
    title.textContent = 'Desvincular tutor';
    desc.textContent  = `¿Seguro que deseas quitar al tutor de este estudiante? El padre perderá acceso a la app si no tiene otros hijos activos.`;
    btn.textContent   = 'Desvincular';
    btn.className     = 'btn-confirm btn-confirm--danger';

    // Override temporal del listener
    const nuevoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevoBtn, btn);
    nuevoBtn.textContent = 'Desvincular';
    nuevoBtn.className   = 'btn-confirm btn-confirm--danger';
    nuevoBtn.addEventListener('click', () => _ejecutarDesvinculacion(nuevoBtn));

    document.getElementById('confirmBackdrop').classList.add('visible');
    setTimeout(() => pwd.focus(), 50);
}

async function _ejecutarDesvinculacion(btn) {
    const pwd = document.getElementById('confirmPassword').value.trim();
    const err = document.getElementById('confirmPasswordError');
    if (!pwd) {
        err.textContent = 'Ingresa tu contraseña.';
        err.style.display = 'block';
        document.getElementById('confirmPassword').focus();
        return;
    }
    btn.disabled = true;
    const { ok, status, data } = await fetchAPI(`/api/students/${ESTUDIANTE_ID}/`, {
        method: 'PATCH',
        body: JSON.stringify({ tutor_id: null, password: pwd }),
    });
    btn.disabled = false;
    if (!ok) {
        err.textContent = status === 403 ? 'Contraseña incorrecta.' : (data?.errores || 'Error al desvincular.');
        err.style.display = 'block';
        return;
    }
    _estudiante = data;
    document.getElementById('confirmBackdrop').classList.remove('visible');
    _renderTutor(data);
}

function _escPE(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Inicializar ─────────────────────────────────────────── */
(async () => {
    const [resEstudiante, resCitaciones] = await Promise.all([
        fetchAPI(`/api/students/${ESTUDIANTE_ID}/`),
        fetchAPI(`/api/discipline/citaciones/?estudiante_id=${ESTUDIANTE_ID}`),
    ]);

    document.getElementById('perfilLoading').style.display = 'none';
    document.getElementById('perfilContent').style.display = 'grid';

    if (resEstudiante.ok) {
        const d = resEstudiante.data;
        _estudiante = d;
        _activo = d.activo;
        document.getElementById('bcCurso').textContent      = d.curso_nombre;
        document.getElementById('bcEstudiante').textContent = d.nombre_completo;
        document.getElementById('pNombre').textContent        = d.nombre_completo;
        document.getElementById('pCurso').textContent         = d.curso_nombre;
        document.getElementById('pIdentificador').textContent  = d.identificador || '—';
        _renderTutor(d);
        renderEstado(_activo);
    }

    document.getElementById('citMesLabel').textContent = _citMesLabel(_citMes);
    _actualizarBotonesCitMes();
    if (resCitaciones.ok) {
        renderCitaciones(Array.isArray(resCitaciones.data) ? resCitaciones.data : []);
    }

    // Mostrar y cargar el calendario
    document.getElementById('perfilCalCard').style.display = '';
    _actualizarBotonesCalendario();
    await loadCalendario();
})();

/* ── Modal confirmación ──────────────────────────────────── */
const confirmBackdrop  = document.getElementById('confirmBackdrop');
const confirmIcon      = document.getElementById('confirmIcon');
const confirmTitle     = document.getElementById('confirmTitle');
const confirmDesc      = document.getElementById('confirmDesc');
const btnConfirmAceptar  = document.getElementById('btnConfirmAceptar');
const btnConfirmCancelar = document.getElementById('btnConfirmCancelar');

document.getElementById('btnCambiarEstado').addEventListener('click', () => {
    if (_activo) {
        confirmIcon.className     = 'confirm-modal-icon confirm-modal-icon--danger';
        confirmTitle.textContent  = 'Dar de baja al estudiante';
        confirmDesc.textContent   = 'El estudiante dejará de aparecer en los listados de asistencia y búsquedas. Esta acción es reversible: podrás reactivarlo en cualquier momento desde este mismo perfil.';
        btnConfirmAceptar.className     = 'btn-confirm btn-confirm--danger';
        btnConfirmAceptar.textContent   = 'Sí, dar de baja';
    } else {
        confirmIcon.className     = 'confirm-modal-icon confirm-modal-icon--success';
        confirmTitle.textContent  = 'Reactivar estudiante';
        confirmDesc.textContent   = 'El estudiante volverá a aparecer en los listados de asistencia y búsquedas de todos los usuarios.';
        btnConfirmAceptar.className     = 'btn-confirm btn-confirm--success';
        btnConfirmAceptar.textContent   = 'Sí, reactivar';
    }
    confirmBackdrop.classList.add('visible');
});

function cerrarConfirm() {
    confirmBackdrop.classList.remove('visible');
    document.getElementById('confirmPassword').value = '';
    document.getElementById('confirmPasswordError').textContent = '';
}
btnConfirmCancelar.addEventListener('click', cerrarConfirm);
confirmBackdrop.addEventListener('click', e => { if (e.target === confirmBackdrop) cerrarConfirm(); });

btnConfirmAceptar.addEventListener('click', async () => {
    const password = document.getElementById('confirmPassword').value.trim();
    const errorEl  = document.getElementById('confirmPasswordError');

    if (!password) {
        errorEl.textContent = 'Ingresa tu contraseña para confirmar.';
        return;
    }
    errorEl.textContent = '';
    cerrarConfirm();

    const nuevoEstado = !_activo;
    const { ok, data } = await fetchAPI(`/api/students/${ESTUDIANTE_ID}/`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: nuevoEstado, password }),
    });
    if (!ok) {
        // Reabrir el modal mostrando el error (ej: contraseña incorrecta)
        confirmBackdrop.classList.add('visible');
        document.getElementById('confirmPasswordError').textContent = data?.errores || 'Error al procesar la solicitud.';
        return;
    }
    _activo = data.activo;
    renderEstado(_activo);
});

/* ── Modal editar nombre ────────────────────────────────── */
const editNombreBackdrop = document.getElementById('editNombreBackdrop');
const enNombre       = document.getElementById('enNombre');
const enPaterno      = document.getElementById('enPaterno');
const enMaterno      = document.getElementById('enMaterno');
const enPassword     = document.getElementById('enPassword');
const enError        = document.getElementById('enError');
const enPasswordError = document.getElementById('enPasswordError');
const btnEnGuardar   = document.getElementById('btnEnGuardar');

document.getElementById('btnEditNombre').addEventListener('click', () => {
    if (!_estudiante) return;
    enNombre.value   = _estudiante.nombre || '';
    enPaterno.value  = _estudiante.apellido_paterno || '';
    enMaterno.value  = _estudiante.apellido_materno || '';
    enPassword.value = '';
    [enNombre, enPaterno, enMaterno].forEach(el => el.classList.remove('input-error'));
    enError.textContent = '';
    enPasswordError.textContent = '';
    editNombreBackdrop.classList.add('visible');
    enNombre.focus();
});

function cerrarEditNombre() {
    editNombreBackdrop.classList.remove('visible');
}
document.getElementById('btnEnCancelar').addEventListener('click', cerrarEditNombre);
editNombreBackdrop.addEventListener('click', e => { if (e.target === editNombreBackdrop) cerrarEditNombre(); });

[enNombre, enPaterno, enMaterno].forEach(el => {
    el.addEventListener('input', () => {
        const start = el.selectionStart;
        const end   = el.selectionEnd;
        el.value = el.value.toUpperCase();
        el.setSelectionRange(start, end);
    });
});

btnEnGuardar.addEventListener('click', async () => {
    const nombre   = enNombre.value.trim();
    const paterno  = enPaterno.value.trim();
    const materno  = enMaterno.value.trim();
    const password = enPassword.value.trim();

    [enNombre, enPaterno, enMaterno].forEach(el => el.classList.remove('input-error'));
    enError.textContent = '';
    enPasswordError.textContent = '';

    let valido = true;
    if (!nombre) { enNombre.classList.add('input-error'); valido = false; }
    if (!paterno && !materno) {
        enPaterno.classList.add('input-error');
        enMaterno.classList.add('input-error');
        valido = false;
    }
    if (!valido) {
        enError.textContent = 'El nombre y al menos un apellido son obligatorios.';
        return;
    }
    if (!password) {
        enPasswordError.textContent = 'Ingresa tu contraseña para confirmar.';
        return;
    }

    btnEnGuardar.disabled = true;
    btnEnGuardar.textContent = 'Guardando...';

    const { ok, data } = await fetchAPI(`/api/students/${ESTUDIANTE_ID}/`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre, apellido_paterno: paterno, apellido_materno: materno, password }),
    });

    btnEnGuardar.disabled = false;
    btnEnGuardar.textContent = 'Guardar cambios';

    if (!ok) {
        enPasswordError.textContent = data?.errores || 'Error al guardar. Intenta nuevamente.';
        return;
    }

    _estudiante = data;
    document.getElementById('pNombre').textContent      = data.nombre_completo;
    document.getElementById('bcEstudiante').textContent = data.nombre_completo;
    cerrarEditNombre();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && editNombreBackdrop.classList.contains('visible')) cerrarEditNombre();
});

/* ── Sidebar ────────────────────────────────────────────── */
const _user = JSON.parse(localStorage.getItem('user') || 'null');
if (_user) {
    const nombre = `${_user.first_name || ''} ${_user.last_name || ''}`.trim() || _user.username;
    document.getElementById('profileName').textContent = "Republica de Francia 'A'";
    document.getElementById('profileRole').textContent = _user.tipo_usuario || 'Administración';
}

const sidebar  = document.querySelector('.sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
const btnMenu  = document.getElementById('btnMenu');

const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
sidebar.addEventListener('mouseenter', () => { if (isDesktop()) sidebar.classList.add('sidebar--expanded'); });
sidebar.addEventListener('mouseleave', () => { if (isDesktop()) sidebar.classList.remove('sidebar--expanded'); });

function openSidebar()  { sidebar.classList.add('sidebar--open');    backdrop.classList.add('visible'); }
function closeSidebar() { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); }

btnMenu.addEventListener('click', () =>
    sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()
);
backdrop.addEventListener('click', closeSidebar);

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    window.location.replace('/login/');
});
