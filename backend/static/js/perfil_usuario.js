'use strict';

const USER_ID = parseInt(document.getElementById('perfilRoot').dataset.userId, 10);

// ── DOM refs ──────────────────────────────────────────────────────
const perfilNombre     = document.getElementById('perfilNombre');
const perfilUsername   = document.getElementById('perfilUsername');
const perfilRol        = document.getElementById('perfilRol');
const perfilLastLogin  = document.getElementById('perfilLastLogin');
const perfilIniciales  = document.getElementById('perfilIniciales');

const btnReset         = document.getElementById('btnResetPassword');

const modalConfirm     = document.getElementById('modalConfirm');
const btnConfirmSi     = document.getElementById('btnConfirmSi');
const btnConfirmNo     = document.getElementById('btnConfirmNo');
const confirmSpinner   = document.getElementById('confirmSpinner');
const confirmText      = document.getElementById('confirmText');

const modalCred        = document.getElementById('modalCred');
const credNombre       = document.getElementById('credNombre');
const credUser         = document.getElementById('credUser');
const credPass         = document.getElementById('credPass');
const btnCredOk        = document.getElementById('btnCredOk');

// ── Helpers ───────────────────────────────────────────────────────
const BADGE = {
    'Profesor': { cls: 'badge--docente',  label: 'Docente'  },
    'Tutor':    { cls: 'badge--padre',    label: 'Padre'    },
    'Regente':  { cls: 'badge--regente',  label: 'Regente'  },
    'Director': { cls: 'badge--director', label: 'Director' },
};

function badgeHtml(rol) {
    const b = BADGE[rol] || { cls: 'badge--default', label: rol || '—' };
    return `<span class="role-badge ${b.cls}">${b.label}</span>`;
}

function formatLastLogin(dt) {
    if (!dt) return '<span class="no-data">Nunca entró</span>';
    const d        = new Date(dt);
    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dDate    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - dDate) / 86400000);
    const hh   = d.getHours().toString().padStart(2, '0');
    const mm   = d.getMinutes().toString().padStart(2, '0');
    const time = `${hh}:${mm}`;
    if (diffDays === 0) return `Hoy, ${time}`;
    if (diffDays === 1) return `Ayer, ${time}`;
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

// ── Cargar datos del usuario ──────────────────────────────────────
(async () => {
    const { ok, data } = await fetchAPI(`/api/users/${USER_ID}/`);
    if (!ok) {
        perfilNombre.textContent = 'Usuario no encontrado';
        btnReset.disabled = true;
        return;
    }

    const nombre = `${data.first_name} ${data.last_name}`.trim();
    perfilNombre.textContent    = nombre || data.username;
    perfilUsername.textContent  = `@${data.username}`;
    perfilRol.innerHTML         = badgeHtml(data.rol);
    perfilLastLogin.innerHTML   = formatLastLogin(data.last_login);
    perfilIniciales.textContent = (
        (data.first_name?.[0] || '') + (data.last_name?.[0] || '')
    ).toUpperCase() || data.username[0].toUpperCase();
})();

// ── Resetear contraseña ───────────────────────────────────────────
btnReset.addEventListener('click', () => {
    modalConfirm.classList.add('visible');
});

btnConfirmNo.addEventListener('click', () => {
    modalConfirm.classList.remove('visible');
});

btnConfirmSi.addEventListener('click', async () => {
    btnConfirmSi.disabled = true;
    btnConfirmNo.disabled = true;
    confirmText.classList.add('hidden');
    confirmSpinner.classList.remove('hidden');

    const { ok, data } = await fetchAPI('/api/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ user_id: USER_ID }),
    });

    btnConfirmSi.disabled = false;
    btnConfirmNo.disabled = false;
    confirmText.classList.remove('hidden');
    confirmSpinner.classList.add('hidden');
    modalConfirm.classList.remove('visible');

    if (!ok) return;

    credNombre.textContent = perfilNombre.textContent;
    credUser.textContent   = perfilUsername.textContent.replace('@', '');
    credPass.textContent   = data.password_nueva;
    modalCred.classList.add('visible');
});

btnCredOk.addEventListener('click', () => {
    modalCred.classList.remove('visible');
});

// ── Copiar credenciales ───────────────────────────────────────────
document.querySelectorAll('.cred-copy').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = document.getElementById(btn.dataset.target).textContent;
        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        });
    });
});
