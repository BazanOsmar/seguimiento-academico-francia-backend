'use strict';

const API_USERS = '/api/users/';

let _usuarios  = [];
let _stats     = { total: 0, docentes: 0, padres: 0, regentes: 0 };
let _filtroRol = 'all';
let _filtroSearch = '';

// ── Estado paginación ─────────────────────────────────────────────
let _usuariosPage = 1;
const _usuariosPerPage = 10;

const renderPaginationHTML = (total, perPage, current) => {
    if (total <= perPage) return '';
    const pages = Math.ceil(total / perPage);
    let html = `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:6px;">`;
    for(let i=1; i<=pages; i++) {
        const bg = (i === current) ? 'var(--accent)' : 'transparent';
        const color = (i === current) ? '#fff' : 'var(--text-primary)';
        const border = (i === current) ? 'var(--accent)' : 'var(--border)';
        html += `<button class="-page-btn" data-p="${i}" style="border:1px solid ${border}; border-radius:6px; background:${bg}; color:${color}; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:600; font-size:0.75rem; transition:all 0.15s;">${i}</button>`;
    }
    html += `</div>`;
    return html;
};

// ── DOM refs ──────────────────────────────────────────────────────
const tbody      = document.getElementById('tbodyUsuarios');
const tableCount = document.getElementById('tableCount');

const statTotal    = document.getElementById('statTotal');
const statDocentes = document.getElementById('statDocentes');
const statPadres   = document.getElementById('statPadres');
const statRegentes = document.getElementById('statRegentes');

const modalNuevoOverlay = document.getElementById('modalNuevoOverlay');
const btnNuevo          = document.getElementById('btnNuevoUsuario');
const btnCerrar         = document.getElementById('btnCerrarDrawer');
const btnCancelar       = document.getElementById('btnCancelarDrawer');
const btnContinuar      = document.getElementById('btnContinuar');
const btnVolver         = document.getElementById('btnVolver');
const btnGuardar        = document.getElementById('btnGuardar');
const btnGuardarText    = document.getElementById('btnGuardarText');
const btnGuardarSpinner = document.getElementById('btnGuardarSpinner');

const modalBackdrop      = document.getElementById('modalBackdrop');
const modalNombreUsuario = document.getElementById('modalNombreUsuario');
const credUser           = document.getElementById('credUser');
const credPass           = document.getElementById('credPass');
const btnModalOk         = document.getElementById('btnModalOk');

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(str) {
    return String(str || '')
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

// ── Badges ────────────────────────────────────────────────────────
const BADGE = {
    'Profesor': { cls: 'badge--docente',  label: 'Docente'  },
    'Tutor':    { cls: 'badge--padre',    label: 'Padre'    },
    'Regente':  { cls: 'badge--regente',  label: 'Regente'  },
    'Director': { cls: 'badge--director', label: 'Director' },
};

function badgeHtml(rol) {
    const b = BADGE[rol] || { cls: 'badge--default', label: rol || '—' };
    return `<span class="role-badge ${b.cls}">${escHtml(b.label)}</span>`;
}

function fcmBadgeHtml(tieneFcm) {
    if (tieneFcm) {
        return `<span class="fcm-badge fcm-badge--activo">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            Con app
        </span>`;
    }
    return `<span class="fcm-badge fcm-badge--sin">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        Sin app
    </span>`;
}

// ── Formato last_login ────────────────────────────────────────────
function formatLastLogin(dt) {
    if (!dt) return '<span class="no-data">Nunca entró</span>';
    const d        = new Date(dt);
    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dDate    = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
    const diffDays = Math.round((today - dDate) / 86400000);
    const hh   = d.getHours().toString().padStart(2, '0');
    const mm   = d.getMinutes().toString().padStart(2, '0');
    const time = `${hh}:${mm}`;
    if (diffDays === 0) return `Hoy, ${time}`;
    if (diffDays === 1) return `Ayer, ${time}`;
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats(s) {
    statTotal.textContent    = s.total;
    statDocentes.textContent = s.docentes;
    statPadres.textContent   = s.padres;
    statRegentes.textContent = s.regentes;
}

// ── Filtros (locales) ─────────────────────────────────────────────
function aplicarFiltros(resetPage = true) {
    if (resetPage) _usuariosPage = 1;
    const lista = _usuarios.filter(u => {
        if (_filtroRol !== 'all' && u.rol !== _filtroRol) return false;
        if (_filtroSearch) {
            const q = _filtroSearch.toLowerCase();
            const fullName = `${u.first_name || ''} ${u.last_name || ''} ${u.username || ''}`.toLowerCase();
            if (!fullName.includes(q)) return false;
        }
        return true;
    });
    renderTabla(lista);
}

// ── Tarjetas como filtro ──────────────────────────────────────────
document.querySelectorAll('.stat-card--clickable').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.stat-card--clickable').forEach(c =>
            c.classList.remove('stat-card--active')
        );
        card.classList.add('stat-card--active');
        _filtroRol = card.dataset.filter;
        aplicarFiltros();
    });
});

// ── Búsqueda ──────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', e => {
        _filtroSearch = e.target.value.trim();
        aplicarFiltros(true);
    });
}

// ── Tabla ─────────────────────────────────────────────────────────
function renderTabla(lista) {
    const footer = document.getElementById('tableFooterUsers');
    if (!lista.length) {
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="5">No se encontraron usuarios.</td></tr>`;
        tableCount.textContent = '0 registros';
        if (footer) footer.innerHTML = '';
        return;
    }

    const total = lista.length;
    const from = (_usuariosPage - 1) * _usuariosPerPage;
    const paginadas = lista.slice(from, from + _usuariosPerPage);

    tbody.innerHTML = paginadas.map(u => `
        <tr class="tr-clickable" data-id="${u.id}" style="cursor:pointer;">
            <td class="td-name">${escHtml(u.first_name)}</td>
            <td>${escHtml(u.last_name)}</td>
            <td>${badgeHtml(u.rol)}</td>
            <td>${fcmBadgeHtml(u.tiene_fcm)}</td>
            <td class="td-muted">${formatLastLogin(u.last_login)}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.tr-clickable').forEach(tr => {
        tr.addEventListener('click', () => abrirPerfil(parseInt(tr.dataset.id, 10)));
    });

    tableCount.textContent = `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`;

    if (footer) {
        footer.innerHTML = renderPaginationHTML(total, _usuariosPerPage, _usuariosPage);
        footer.querySelectorAll('.-page-btn').forEach(b => {
             b.addEventListener('click', (e) => {
                 _usuariosPage = parseInt(e.target.dataset.p);
                 document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                 aplicarFiltros(false);
             });
        });
    }
}

// ── Modal Nuevo Usuario ───────────────────────────────────────────
function _irPaso(paso) {
    document.getElementById('mnPaso1').classList.toggle('hidden', paso !== 1);
    document.getElementById('mnPaso2').classList.toggle('hidden', paso !== 2);
    document.getElementById('mnFooter1').classList.toggle('hidden', paso !== 1);
    document.getElementById('mnFooter2').classList.toggle('hidden', paso !== 2);
}

function abrirDrawer() {
    clearErrors();
    document.getElementById('fNombre').value    = '';
    document.getElementById('fApellidos').value = '';
    document.getElementById('fRol').value       = '';
    document.getElementById('fPasswordDirector').value = '';
    document.getElementById('mnPassErr').classList.remove('visible');
    document.getElementById('fPasswordDirector').classList.remove('input-error');
    _irPaso(1);
    modalNuevoOverlay.classList.add('visible');
    document.getElementById('fNombre').focus();
}

function cerrarDrawer() {
    modalNuevoOverlay.classList.remove('visible');
}

btnNuevo.addEventListener('click', abrirDrawer);
btnCerrar.addEventListener('click', cerrarDrawer);
btnCancelar.addEventListener('click', cerrarDrawer);
modalNuevoOverlay.addEventListener('click', e => {
    if (e.target === modalNuevoOverlay) cerrarDrawer();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalNuevoOverlay.classList.contains('visible')) cerrarDrawer();
});

btnContinuar.addEventListener('click', () => {
    clearErrors();
    const nombre    = document.getElementById('fNombre').value.trim();
    const apellidos = document.getElementById('fApellidos').value.trim();
    const rol       = document.getElementById('fRol').value;

    let valido = true;
    if (!nombre)    { inputError(document.getElementById('fNombre'),    'Campo obligatorio.'); valido = false; }
    if (!apellidos) { inputError(document.getElementById('fApellidos'), 'Campo obligatorio.'); valido = false; }
    if (!rol)       { inputError(document.getElementById('fRol'),       'Selecciona un rol.'); valido = false; }
    if (!valido) return;

    const ROL_LABEL = { Profesor: 'Profesor', Regente: 'Regente' };
    document.getElementById('mnResumenNombre').textContent = `${nombre} ${apellidos}`;
    document.getElementById('mnResumenRol').textContent    = ROL_LABEL[rol] || rol;
    document.getElementById('mnPassErr').classList.remove('visible');
    document.getElementById('fPasswordDirector').classList.remove('input-error');
    _irPaso(2);
    document.getElementById('fPasswordDirector').focus();
});

btnVolver.addEventListener('click', () => {
    _irPaso(1);
    document.getElementById('fNombre').focus();
});

// ── Guardar ───────────────────────────────────────────────────────
btnGuardar.addEventListener('click', async () => {
    clearErrors();

    const nombre            = document.getElementById('fNombre').value.trim();
    const apellidos         = document.getElementById('fApellidos').value.trim();
    const rol               = document.getElementById('fRol').value;
    const passwordDirector  = document.getElementById('fPasswordDirector').value;
    const passErrEl         = document.getElementById('mnPassErr');
    const passInputEl       = document.getElementById('fPasswordDirector');

    if (!passwordDirector) {
        passErrEl.textContent = 'Ingresa tu contraseña para confirmar.';
        passErrEl.classList.add('visible');
        passInputEl.classList.add('input-error');
        passInputEl.focus();
        return;
    }

    passErrEl.classList.remove('visible');
    passInputEl.classList.remove('input-error');
    setGuardando(true);

    const { ok, data } = await fetchAPI(API_USERS, {
        method: 'POST',
        body: JSON.stringify({
            first_name:        nombre,
            last_name:         apellidos,
            tipo_usuario:      rol,
            password_director: passwordDirector,
        }),
    });

    setGuardando(false);
    if (!ok) {
        if (data?.password_director) {
            passErrEl.textContent = data.password_director[0];
            passErrEl.classList.add('visible');
            passInputEl.classList.add('input-error');
            passInputEl.focus();
        }
        return;
    }

    _usuarios.unshift({
        id:         data.id,
        first_name: data.first_name,
        last_name:  data.last_name,
        username:   data.username,
        rol:        data.tipo_usuario,
        last_login: null,
    });
    _stats.total++;
    if (data.tipo_usuario === 'Profesor') _stats.docentes++;
    if (data.tipo_usuario === 'Regente')  _stats.regentes++;
    renderStats(_stats);

    // Volver a "Todos" para mostrar el nuevo usuario
    document.querySelectorAll('.stat-card--clickable').forEach(c =>
        c.classList.remove('stat-card--active')
    );
    document.querySelector('[data-filter="all"]').classList.add('stat-card--active');
    _filtroRol = 'all';
    aplicarFiltros();

    cerrarDrawer();
    mostrarCredenciales(data);
});

// ── Modal credenciales ────────────────────────────────────────────
function mostrarCredenciales(data) {
    modalNombreUsuario.textContent = `${data.first_name} ${data.last_name}`;
    credUser.textContent = data.username;
    credPass.textContent = data.password_inicial;
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
    const { ok, data } = await fetchAPI(API_USERS);
    if (!ok) return;
    _stats    = data.stats;
    _usuarios = data.usuarios;
    renderStats(_stats);
    renderTabla(_usuarios);
})();

// ── Modal: Perfil de Usuario ──────────────────────────────────────
const pmOverlay        = document.getElementById('pmOverlay');
const pmBox            = document.getElementById('pmBox');
const pmClose          = document.getElementById('pmClose');
const pmContent        = document.getElementById('pmContent');
const pmLoading        = document.getElementById('pmLoading');
const pmConfirmOverlay = document.getElementById('pmConfirmOverlay');
const pmConfirmPwd     = document.getElementById('pmConfirmPwd');
const pmConfirmPwdErr  = document.getElementById('pmConfirmPwdErr');
const pmConfirmNo      = document.getElementById('pmConfirmNo');
const pmConfirmSi      = document.getElementById('pmConfirmSi');
const pmConfirmText    = document.getElementById('pmConfirmText');
const pmConfirmSpinner = document.getElementById('pmConfirmSpinner');
const pmCredOverlay    = document.getElementById('pmCredOverlay');
const pmCredNombre     = document.getElementById('pmCredNombre');
const pmCredUser       = document.getElementById('pmCredUser');
const pmCredPass       = document.getElementById('pmCredPass');
const pmCredOk         = document.getElementById('pmCredOk');

let _pmUserId = null;
let _pmData   = null;

const ESTADO_MAP = {
    'PENDIENTE':  { cls: 'estado--pendiente',  label: 'Pendiente'  },
    'ASISTIO':    { cls: 'estado--asistio',    label: 'Asistió'    },
    'NO_ASISTIO': { cls: 'estado--no_asistio', label: 'No asistió' },
    'ATRASO':     { cls: 'estado--atraso',     label: 'Atraso'     },
};
function estadoBadgeHtml(estado) {
    const b = ESTADO_MAP[estado] || { cls: '', label: estado || '—' };
    return `<span class="estado-badge ${b.cls}">${b.label}</span>`;
}

function _activarEdicion() {
    pmContent.querySelector('#pmDisplayNombre').style.display  = 'none';
    pmContent.querySelector('#pmDisplayUsername').style.display = 'none';
    pmContent.querySelector('#pmEditForm').style.display       = '';
    pmContent.querySelector('.pm-actions-section').style.display = 'none';
    pmContent.querySelector('#pmEditNombre').focus();

    pmContent.querySelector('.pm-btn-cancel-edit').addEventListener('click', _desactivarEdicion);
    pmContent.querySelector('.pm-btn-save-edit').addEventListener('click', _guardarEdicion);
}

function _desactivarEdicion() {
    pmContent.querySelector('#pmDisplayNombre').style.display  = '';
    pmContent.querySelector('#pmDisplayUsername').style.display = '';
    pmContent.querySelector('#pmEditForm').style.display       = 'none';
    pmContent.querySelector('.pm-actions-section').style.display = '';
    pmContent.querySelector('#pmEditErr').classList.add('hidden');
    pmContent.querySelector('#pmEditPwdConfirm').value         = '';
}

async function _guardarEdicion() {
    const firstName = pmContent.querySelector('#pmEditNombre').value.trim();
    const lastName  = pmContent.querySelector('#pmEditApellidos').value.trim();
    const pwdConfirm = pmContent.querySelector('#pmEditPwdConfirm').value;
    const errEl     = pmContent.querySelector('#pmEditErr');
    errEl.classList.add('hidden');

    if (!firstName || !lastName) {
        errEl.textContent = 'Nombre y apellidos son obligatorios.';
        errEl.classList.remove('hidden');
        return;
    }
    if (!pwdConfirm) {
        errEl.textContent = 'Ingresa tu contraseña para confirmar.';
        errEl.classList.remove('hidden');
        return;
    }

    const btnSave = pmContent.querySelector('.pm-btn-save-edit');
    btnSave.disabled    = true;
    btnSave.textContent = 'Guardando...';

    const { ok, data } = await fetchAPI(`/api/users/${_pmUserId}/`, {
        method: 'PATCH',
        body:   JSON.stringify({ first_name: firstName, last_name: lastName, password_director: pwdConfirm }),
    });

    btnSave.disabled    = false;
    btnSave.textContent = 'Guardar';

    if (!ok) {
        errEl.textContent = data?.errores || data?.first_name?.[0] || data?.last_name?.[0] || 'Error al guardar.';
        errEl.classList.remove('hidden');
        return;
    }

    const nuevoNombre = `${data.first_name} ${data.last_name}`.trim();
    pmContent.querySelector('#pmDisplayNombre').textContent = nuevoNombre;

    if (_pmData) { _pmData.first_name = data.first_name; _pmData.last_name = data.last_name; }
    const idx = _usuarios.findIndex(u => u.id === _pmUserId);
    if (idx !== -1) {
        _usuarios[idx].first_name = data.first_name;
        _usuarios[idx].last_name  = data.last_name;
        aplicarFiltros();
    }

    _desactivarEdicion();
}

function _cerrarPerfil() {
    pmOverlay.classList.remove('visible');
    pmContent.innerHTML = '';
    pmBox.classList.remove('pm-box--wide');
    _pmUserId = null;
    _pmData   = null;
}

pmClose.addEventListener('click', _cerrarPerfil);
pmOverlay.addEventListener('click', e => { if (e.target === pmOverlay) _cerrarPerfil(); });

async function abrirPerfil(userId) {
    _pmUserId = userId;
    _pmData   = null;
    pmContent.innerHTML = '';
    pmBox.classList.remove('pm-box--wide');
    pmLoading.classList.remove('hidden');
    pmOverlay.classList.add('visible');
    document.getElementById('pmBox').querySelector('.pm-body').scrollTop = 0;

    const { ok, data } = await fetchAPI(`/api/users/${userId}/`);
    pmLoading.classList.add('hidden');

    if (!ok) {
        pmContent.innerHTML = '<p style="padding:32px;text-align:center;color:var(--danger);">Error al cargar el perfil.</p>';
        return;
    }
    _pmData = data;

    if (data.rol === 'Profesor') pmBox.classList.add('pm-box--wide');

    pmContent.innerHTML = _buildPerfilHtml(data);

    // Botón resetear
    pmContent.querySelector('.pm-btn-reset')?.addEventListener('click', () => {
        pmConfirmPwd.value = '';
        pmConfirmPwdErr.classList.add('hidden');
        pmConfirmPwd.classList.remove('input-error');
        pmConfirmOverlay.classList.add('visible');
        setTimeout(() => pmConfirmPwd.focus(), 50);
    });

    // Botón editar
    pmContent.querySelector('.pm-btn-edit')?.addEventListener('click', _activarEdicion);

    // Copiar credenciales en pmCredOverlay
    document.querySelectorAll('#pmCredOverlay .cred-copy').forEach(btn => {
        btn.onclick = () => {
            const text = document.getElementById(btn.dataset.target)?.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 1500);
            });
        };
    });

    // Planes del profesor
    if (data.rol === 'Profesor') {
        _initPlanesSelectors(data.cursos || [], userId);
    }
}

function _buildPerfilHtml(data) {
    const nombre   = `${data.first_name} ${data.last_name}`.trim() || data.username;
    const iniciales = ((data.first_name?.[0] || '') + (data.last_name?.[0] || '')).toUpperCase() || data.username[0].toUpperCase();
    const rol = data.rol;
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const bannerHtml = data.primer_ingreso ? `
        <div class="pm-banner-warn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Este usuario nunca ha cambiado su contraseña inicial.
        </div>` : '';

    const cardHtml = `
        ${bannerHtml}
        <div class="pm-avatar">${iniciales}</div>
        <p class="pm-nombre" id="pmDisplayNombre">${escHtml(nombre)}</p>
        <p class="pm-username" id="pmDisplayUsername">@${escHtml(data.username)}</p>
        <div class="pm-rol">${badgeHtml(rol)}</div>

        <div class="pm-edit-form" id="pmEditForm" style="display:none;">
            <div>
                <label class="pm-edit-label">Nombre</label>
                <input class="pm-edit-input" id="pmEditNombre" type="text" value="${escHtml(data.first_name)}" maxlength="50">
            </div>
            <div>
                <label class="pm-edit-label">Apellidos</label>
                <input class="pm-edit-input" id="pmEditApellidos" type="text" value="${escHtml(data.last_name)}" maxlength="50">
            </div>
            <div>
                <label class="pm-edit-label">Tu contraseña (confirmación)</label>
                <input class="pm-edit-input" id="pmEditPwdConfirm" type="password" placeholder="Ingresa tu contraseña" maxlength="20">
            </div>
            <p class="pm-edit-err hidden" id="pmEditErr"></p>
            <div class="pm-edit-btns">
                <button class="btn-ghost pm-btn-cancel-edit" style="flex:1;height:34px;font-size:.8rem;">Cancelar</button>
                <button class="btn-primary pm-btn-save-edit" style="flex:1;height:34px;font-size:.8rem;">Guardar</button>
            </div>
        </div>

        <div class="pm-stats-grid">
            <div class="pm-stat-item">
                <p class="pm-stat-label">Último acceso</p>
                <p class="pm-stat-val">${formatLastLogin(data.last_login)}</p>
            </div>
            <div class="pm-stat-item">
                <p class="pm-stat-label">Ingresos totales</p>
                <p class="pm-stat-val">${data.total_ingresos ?? '—'}</p>
            </div>
            <div class="pm-stat-item" style="grid-column:1/-1;">
                <p class="pm-stat-label">Notificaciones push</p>
                <p class="pm-stat-val">${fcmBadgeHtml(data.tiene_fcm)}</p>
            </div>
        </div>
        <div class="pm-actions-section">
            <p class="pm-actions-label">Acciones</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button class="pm-btn-edit">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Editar datos
                </button>
                <button class="pm-btn-reset">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Resetear contraseña
                </button>
            </div>
        </div>`;

    // ── Tutor / Regente — layout simple ──────────────────────────
    if (rol === 'Tutor' || rol === 'Regente') {
        let sectionsHtml = '';

        if (rol === 'Tutor' && data.estudiantes && data.estudiantes.length > 0) {
            sectionsHtml += `
            <div class="pm-section">
                <p class="pm-section-title">Estudiante vinculado</p>
                ${data.estudiantes.map(e => {
                    const ini  = ((e.nombre?.[0] || '') + (e.apellido_paterno?.[0] || '')).toUpperCase();
                    const curso = `${e.curso__grado} ${e.curso__paralelo}`;
                    const ident = e.identificador ? `ID: ${e.identificador}` : 'Sin identificador';
                    const badge = e.activo
                        ? `<span style="font-size:.65rem;padding:2px 6px;border-radius:20px;background:rgba(34,197,94,.12);color:#22c55e;font-weight:600;">Activo</span>`
                        : `<span style="font-size:.65rem;padding:2px 6px;border-radius:20px;background:rgba(239,68,68,.12);color:#ef4444;font-weight:600;">Baja</span>`;
                    return `
                    <a class="pm-est-card" href="/director/estudiantes/${e.curso__id}/${e.id}/">
                        <div class="pm-est-avatar">${ini}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:.85rem;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
                                <span>${escHtml((e.apellido_paterno + ' ' + e.apellido_materno).trim())}, ${escHtml(e.nombre)}</span>${badge}
                            </div>
                            <div style="font-size:.74rem;color:var(--text-muted);margin-top:2px;">${escHtml(curso)} · ${escHtml(ident)}</div>
                        </div>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>`;
                }).join('')}
            </div>`;
        }

        const citData   = rol === 'Tutor' ? data.citaciones_recientes : data.citaciones_emitidas;
        const citTitulo = rol === 'Tutor' ? 'Últimas citaciones' : 'Últimas citaciones emitidas';
        const citHeader = rol === 'Tutor' ? 'Fecha límite' : 'Fecha envío';

        if (rol !== 'Regente' && citData && citData.length > 0) {
            sectionsHtml += `
            <div class="pm-section">
                <p class="pm-section-title">${citTitulo}</p>
                <div class="pm-cit-wrap">
                    <table class="pm-cit-table">
                        <thead><tr><th>Estudiante</th><th>Motivo</th><th>Estado</th><th>${citHeader}</th></tr></thead>
                        <tbody>
                        ${citData.map(c => {
                            const est = `${escHtml((c.estudiante__apellido_paterno + ' ' + c.estudiante__apellido_materno).trim())}, ${escHtml(c.estudiante__nombre)}`;
                            const rawFecha = rol === 'Tutor' ? c.fecha_limite_asistencia : c.fecha_envio;
                            let fechaStr = '—';
                            if (rawFecha) {
                                const d = new Date(rol === 'Tutor' ? rawFecha + 'T00:00:00' : rawFecha);
                                fechaStr = `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
                            }
                            return `<tr>
                                <td>${est}</td>
                                <td style="color:var(--text-secondary)">${escHtml(c.motivo)}</td>
                                <td>${estadoBadgeHtml(c.asistencia)}</td>
                                <td style="color:var(--text-muted)">${fechaStr}</td>
                            </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        }

        return `<div class="pm-simple-layout">
            ${cardHtml}
            ${sectionsHtml ? `<div class="pm-sections">${sectionsHtml}</div>` : ''}
        </div>`;
    }

    // ── Profesor — layout dos columnas ───────────────────────────
    const cursosHtml = data.cursos && data.cursos.length > 0
        ? `<div class="pm-cursos-chips">${data.cursos.map(c =>
            `<span class="pm-curso-chip">
                <span style="font-weight:700;color:var(--accent-text)">${escHtml(c.curso__grado)} ${escHtml(c.curso__paralelo)}</span>
                <span style="color:var(--border)">·</span>
                ${escHtml(c.materia__nombre)}
            </span>`).join('')}</div>`
        : '<p style="color:var(--text-muted);font-size:.82rem;">Sin cursos asignados.</p>';

    const mesesOpts = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
        .map((m, i) => `<option value="${i+1}">${m}</option>`).join('');

    return `<div class="pm-wide-layout">
        <div class="pm-card-col">${cardHtml}</div>
        <div class="pm-col-right">
            <div class="pm-section">
                <p class="pm-section-title">Cursos asignados</p>
                ${cursosHtml}
            </div>
            <div class="pm-section">
                <p class="pm-section-title">Planes de Trabajo</p>
                <div class="pm-planes-filters">
                    <select class="pm-mes-sel" id="pmPlanesSelect">${mesesOpts}</select>
                    <select class="pm-mes-sel" id="pmCursoSelect"></select>
                    <div id="pmMateriaWrap"></div>
                </div>
                <div id="pmPlanesGrid">
                    <div style="padding:10px 0;color:var(--text-muted);font-size:.76rem;">Cargando…</div>
                </div>
            </div>
        </div>
    </div>`;
}

// Detalle de plan
const pmPlanDetOverlay = document.getElementById('pmPlanDetOverlay');
const pmPlanDetClose   = document.getElementById('pmPlanDetClose');
const pmPlanDetTitle   = document.getElementById('pmPlanDetTitle');
const pmPlanDetSub     = document.getElementById('pmPlanDetSub');
const pmPlanDetBody    = document.getElementById('pmPlanDetBody');
const pmPlanDetDates   = document.getElementById('pmPlanDetDates');

pmPlanDetClose.addEventListener('click', () => pmPlanDetOverlay.classList.remove('visible'));
pmPlanDetOverlay.addEventListener('click', e => { if (e.target === pmPlanDetOverlay) pmPlanDetOverlay.classList.remove('visible'); });

let _planesCache = {};  // key: planId → plan object

function _abrirDetallePlan(planId) {
    const p = _planesCache[planId];
    if (!p) return;
    const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    pmPlanDetTitle.textContent = `Semana ${p.semana} — ${MESES_FULL[(p.mes || 1) - 1]}`;
    pmPlanDetSub.textContent   = `${p.curso_nombre}  ·  ${p.materia_nombre}`;
    pmPlanDetBody.textContent  = p.descripcion;
    const fi = p.fecha_inicio ? new Date(p.fecha_inicio + 'T00:00:00') : null;
    const ff = p.fecha_fin    ? new Date(p.fecha_fin    + 'T00:00:00') : null;
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    pmPlanDetDates.textContent = fi && ff
        ? `${fi.getDate()} ${MESES[fi.getMonth()]} — ${ff.getDate()} ${MESES[ff.getMonth()]} ${ff.getFullYear()}`
        : '';
    pmPlanDetOverlay.classList.add('visible');
}

let _allPlanesMes = [];   // planes del profesor para el mes activo

function _initPlanesSelectors(cursos, profesorId) {
    const cursoSel  = document.getElementById('pmCursoSelect');
    const mesSel    = document.getElementById('pmPlanesSelect');
    if (!cursoSel || !mesSel) return;

    // Mapa: "1ro B" → ["Matemáticas", "Lengua", ...]
    const cursosMap = {};
    cursos.forEach(c => {
        const nombre = `${c.curso__grado} ${c.curso__paralelo}`;
        if (!cursosMap[nombre]) cursosMap[nombre] = [];
        if (!cursosMap[nombre].includes(c.materia__nombre)) cursosMap[nombre].push(c.materia__nombre);
    });

    // Poblar selector de cursos
    cursoSel.innerHTML = Object.keys(cursosMap)
        .map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
        .join('');

    function getMateria() {
        const sel = document.getElementById('pmMateriaSelect');
        return sel ? sel.value : (document.getElementById('pmMateriaWrap')?.dataset.materia || '');
    }

    function updateMateriaWrap() {
        const wrap    = document.getElementById('pmMateriaWrap');
        const materias = cursosMap[cursoSel.value] || [];
        if (materias.length === 1) {
            wrap.dataset.materia = materias[0];
            wrap.innerHTML = `<span class="pm-materia-label">${escHtml(materias[0])}</span>`;
        } else {
            wrap.dataset.materia = '';
            wrap.innerHTML = `<select class="pm-mes-sel" id="pmMateriaSelect">
                ${materias.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('')}
            </select>`;
            document.getElementById('pmMateriaSelect').addEventListener('change', () => {
                _renderPlanesGrid(cursoSel.value, getMateria());
            });
        }
        _renderPlanesGrid(cursoSel.value, materias[0]);
    }

    cursoSel.addEventListener('change', updateMateriaWrap);
    mesSel.value = String(new Date().getMonth() + 1);
    mesSel.addEventListener('change', async () => {
        await _cargarPlanesModal(profesorId, mesSel.value);
        _renderPlanesGrid(cursoSel.value, getMateria());
    });

    // Carga inicial
    _cargarPlanesModal(profesorId, mesSel.value).then(() => updateMateriaWrap());
}

async function _cargarPlanesModal(profesorId, mes) {
    const { ok, data } = await fetchAPI(`/api/academics/director/planes/?mes=${mes}&profesor_id=${profesorId}`);
    _allPlanesMes = ok ? (data || []) : [];
    _allPlanesMes.forEach(p => { _planesCache[p.id] = p; });
}

function _renderPlanesGrid(cursoNombre, materiaNombre) {
    const container = document.getElementById('pmPlanesGrid');
    if (!container) return;

    const semanas = { 1: null, 2: null, 3: null, 4: null };
    _allPlanesMes
        .filter(p => p.curso_nombre === cursoNombre && p.materia_nombre === materiaNombre)
        .forEach(p => { if (!semanas[p.semana]) semanas[p.semana] = p; });

    container.innerHTML = `<div class="pm-planes-grid">
        ${[1,2,3,4].map(s => {
            const plan = semanas[s];
            return `<div class="pm-plan-slot">
                <div class="pm-plan-slot-label">Sem ${s}</div>
                ${plan
                    ? `<div class="pm-plan-chip" data-plan-id="${plan.id}">${escHtml(plan.descripcion.substring(0, 70))}${plan.descripcion.length > 70 ? '…' : ''}</div>`
                    : `<div class="pm-plan-empty">—</div>`}
            </div>`;
        }).join('')}
    </div>`;

    container.querySelectorAll('.pm-plan-chip[data-plan-id]').forEach(chip => {
        chip.addEventListener('click', () => _abrirDetallePlan(parseInt(chip.dataset.planId, 10)));
    });
}

// ── Resetear contraseña desde modal perfil ────────────────────────
pmConfirmNo.addEventListener('click', () => pmConfirmOverlay.classList.remove('visible'));

pmConfirmSi.addEventListener('click', async () => {
    const pwd = pmConfirmPwd.value.trim();
    if (!pwd) {
        pmConfirmPwdErr.textContent = 'Ingresa tu contraseña.';
        pmConfirmPwdErr.classList.remove('hidden');
        pmConfirmPwd.classList.add('input-error');
        pmConfirmPwd.focus();
        return;
    }

    pmConfirmSi.disabled = true;
    pmConfirmNo.disabled = true;
    pmConfirmText.classList.add('hidden');
    pmConfirmSpinner.classList.remove('hidden');

    const { ok, status, data } = await fetchAPI('/api/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ user_id: _pmUserId, password_director: pwd }),
    });

    pmConfirmSi.disabled = false;
    pmConfirmNo.disabled = false;
    pmConfirmText.classList.remove('hidden');
    pmConfirmSpinner.classList.add('hidden');

    if (!ok) {
        if (status === 403) {
            pmConfirmPwdErr.textContent = 'Contraseña incorrecta.';
            pmConfirmPwdErr.classList.remove('hidden');
            pmConfirmPwd.classList.add('input-error');
            pmConfirmPwd.focus();
        }
        return;
    }

    pmConfirmOverlay.classList.remove('visible');
    pmConfirmPwd.value = '';

    const nombre = _pmData ? `${_pmData.first_name} ${_pmData.last_name}`.trim() || _pmData.username : '';
    pmCredNombre.textContent = nombre;
    pmCredUser.textContent   = _pmData?.username || '';
    pmCredPass.textContent   = data.password_nueva;
    pmCredOverlay.classList.add('visible');
});

pmCredOk.addEventListener('click', () => pmCredOverlay.classList.remove('visible'));
