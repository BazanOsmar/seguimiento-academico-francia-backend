'use strict';

/* ================================================================
   api.js — Wrapper global de fetch con manejo de respuestas
   ================================================================
   Uso:
     const { ok, data } = await fetchAPI('/api/endpoint/', { method: 'GET' });
   ================================================================ */

// ── Iconos SVG por tipo ──────────────────────────────────────────
const _TOAST_ICONS = {
    error: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>`,
    warning: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
               <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
               <line x1="12" y1="9" x2="12" y2="13"/>
               <line x1="12" y1="17" x2="12.01" y2="17"/>
             </svg>`,
    info: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
             <circle cx="12" cy="12" r="10"/>
             <line x1="12" y1="8" x2="12" y2="12"/>
             <line x1="12" y1="16" x2="12.01" y2="16"/>
           </svg>`,
    success: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
               <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
               <polyline points="22 4 12 14.01 9 11.01"/>
             </svg>`,
};

// ── Títulos por tipo ─────────────────────────────────────────────
const _TOAST_TITLES = {
    error:   'Error',
    warning: 'Atención',
    info:    'Información',
    success: 'Éxito',
};

/* ----------------------------------------------------------------
   showToast(message, type, onAccept)
   Muestra una ventana flotante informativa.
   type: 'error' | 'warning' | 'info' | 'success'
   onAccept: callback opcional al presionar Aceptar
----------------------------------------------------------------- */
function showToast(message, type = 'error', onAccept = null) {
    // Eliminar toast anterior si existe
    const prev = document.getElementById('_appToast');
    if (prev) prev.remove();

    const toast = document.createElement('div');
    toast.id    = '_appToast';
    toast.className = `app-toast app-toast--${type}`;
    toast.setAttribute('role', 'alertdialog');
    toast.setAttribute('aria-modal', 'true');

    toast.innerHTML = `
        <div class="app-toast__icon">${_TOAST_ICONS[type]}</div>
        <div class="app-toast__body">
            <p class="app-toast__title">${_TOAST_TITLES[type]}</p>
            <p class="app-toast__msg"></p>
            <button class="app-toast__btn" id="_toastAccept">Aceptar</button>
        </div>
    `;
    toast.querySelector('.app-toast__msg').textContent = message;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('app-toast--visible'));

    document.getElementById('_toastAccept').addEventListener('click', () => {
        toast.classList.remove('app-toast--visible');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        if (onAccept) onAccept();
    });
}

/* ----------------------------------------------------------------
   fetchAPI(url, options)
   Wrapper de fetch que:
   - Agrega el token JWT automáticamente
   - Intercepta y muestra errores con showToast
   - Redirige a /login/ en 401
   Retorna: { ok: bool, status: int, data: object|null }
----------------------------------------------------------------- */
async function fetchAPI(url, options = {}) {
    const token = localStorage.getItem('access_token');

    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch(url, { ...options, headers });

        // Leer JSON si aplica
        let data = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            data = await res.json();
        }

        // ── Manejo por código de estado ───────────────────────
        if (res.status === 401) {
            showToast(
                'Tu sesión ha expirado o no tienes autorización. Serás redirigido al inicio de sesión.',
                'error',
                () => {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    window.location.replace('/login/');
                }
            );
            return { ok: false, status: 401, data: null };
        }

        if (res.status === 403) {
            showToast('No tienes permisos para realizar esta acción.', 'warning');
            return { ok: false, status: 403, data };
        }

        if (res.status === 404) {
            const msg = data?.errores || data?.detail || 'El recurso solicitado no fue encontrado.';
            showToast(msg, 'info');
            return { ok: false, status: 404, data };
        }

        if (res.status === 400) {
            const msg = data?.errores || data?.detail
                || Object.values(data || {}).flat().join(' ')
                || 'Los datos enviados no son válidos.';
            showToast(msg, 'warning');
            return { ok: false, status: 400, data };
        }

        if (res.status >= 500) {
            showToast('Error interno del servidor. Por favor intenta nuevamente.', 'error');
            return { ok: false, status: res.status, data };
        }

        // ── Respuesta exitosa ─────────────────────────────────
        return { ok: true, status: res.status, data };

    } catch (_err) {
        showToast('No se pudo conectar con el servidor. Verifica tu conexión a internet.', 'error');
        return { ok: false, status: 0, data: null };
    }
}
