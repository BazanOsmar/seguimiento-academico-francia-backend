'use strict';

const API_USERS = '/api/users/';

let _usuarios  = [];
let _stats     = { total: 0, docentes: 0, padres: 0, regentes: 0 };
let _filtroRol = 'all';

// ── DOM refs ──────────────────────────────────────────────────────
const tbody       = document.getElementById('tbodyUsuarios');
const tableCount  = document.getElementById('tableCount');
const searchInput = document.getElementById('searchInput');

const statTotal    = document.getElementById('statTotal');
const statDocentes = document.getElementById('statDocentes');
const statPadres   = document.getElementById('statPadres');
const statRegentes = document.getElementById('statRegentes');

const drawer          = document.getElementById('drawer');
const drawerBackdrop  = document.getElementById('drawerBackdrop');
const btnNuevo        = document.getElementById('btnNuevoUsuario');
const btnCerrar       = document.getElementById('btnCerrarDrawer');
const btnCancelar     = document.getElementById('btnCancelarDrawer');
const btnGuardar      = document.getElementById('btnGuardar');
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
function aplicarFiltros() {
    let lista = _usuarios;

    if (_filtroRol !== 'all') {
        lista = lista.filter(u => u.rol === _filtroRol);
    }

    const q = searchInput.value.toLowerCase().trim();
    if (q) {
        lista = lista.filter(u =>
            (u.first_name || '').toLowerCase().includes(q) ||
            (u.last_name  || '').toLowerCase().includes(q) ||
            (u.username   || '').toLowerCase().includes(q)
        );
    }

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
        searchInput.value = '';
        aplicarFiltros();
    });
});

// ── Buscador ──────────────────────────────────────────────────────
searchInput.addEventListener('input', aplicarFiltros);

// ── Tabla ─────────────────────────────────────────────────────────
function renderTabla(lista) {
    if (!lista.length) {
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="5">No se encontraron usuarios.</td></tr>`;
        tableCount.textContent = '0 registros';
        return;
    }
    tbody.innerHTML = lista.map(u => `
        <tr class="tr-clickable" data-id="${u.id}" style="cursor:pointer;">
            <td class="td-name">${escHtml(u.first_name)}</td>
            <td>${escHtml(u.last_name)}</td>
            <td>${badgeHtml(u.rol)}</td>
            <td>${fcmBadgeHtml(u.tiene_fcm)}</td>
            <td class="td-muted">${formatLastLogin(u.last_login)}</td>
        </tr>
    `).join('');
    tbody.querySelectorAll('.tr-clickable').forEach(tr => {
        tr.addEventListener('click', () => {
            window.location.href = `/director/usuarios/${tr.dataset.id}/`;
        });
    });
    tableCount.textContent = `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`;
}

// ── Drawer ────────────────────────────────────────────────────────
function abrirDrawer() {
    clearErrors();
    ['fNombre', 'fApellidos', 'fUsername'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('fRol').value = '';
    drawer.classList.add('drawer--open');
    drawerBackdrop.classList.add('visible');
    document.getElementById('fNombre').focus();
}

function cerrarDrawer() {
    drawer.classList.remove('drawer--open');
    drawerBackdrop.classList.remove('visible');
}

btnNuevo.addEventListener('click', abrirDrawer);
btnCerrar.addEventListener('click', cerrarDrawer);
btnCancelar.addEventListener('click', cerrarDrawer);
drawerBackdrop.addEventListener('click', cerrarDrawer);

// ── Guardar ───────────────────────────────────────────────────────
btnGuardar.addEventListener('click', async () => {
    clearErrors();

    const nombre    = document.getElementById('fNombre').value.trim();
    const apellidos = document.getElementById('fApellidos').value.trim();
    const username  = document.getElementById('fUsername').value.trim();
    const rol       = document.getElementById('fRol').value;

    let valido = true;
    if (!nombre)    { inputError(document.getElementById('fNombre'),    'Campo obligatorio.'); valido = false; }
    if (!apellidos) { inputError(document.getElementById('fApellidos'), 'Campo obligatorio.'); valido = false; }
    if (!username)  { inputError(document.getElementById('fUsername'),  'Campo obligatorio.'); valido = false; }
    if (!rol)       { inputError(document.getElementById('fRol'),       'Selecciona un rol.'); valido = false; }
    if (!valido) return;

    setGuardando(true);

    const { ok, data } = await fetchAPI(API_USERS, {
        method: 'POST',
        body: JSON.stringify({
            first_name:   nombre,
            last_name:    apellidos,
            username:     username,
            tipo_usuario: rol,
        }),
    });

    setGuardando(false);
    if (!ok) return;

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
    searchInput.value = '';
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
