'use strict';

const LOGIN_URL = '/api/auth/login/';

const REDIRECT = {
    'Director': '/director/',
    'Profesor': '/profesor/',
};

const TIPOS_PERMITIDOS = ['Director', 'Profesor'];

// ─── Rebote: si ya hay sesión activa, ir directo al dashboard ────────────────
(function () {
    const token = localStorage.getItem('access_token');
    const user  = JSON.parse(localStorage.getItem('user') || 'null');
    if (token && user && REDIRECT[user.tipo_usuario]) {
        window.location.replace(REDIRECT[user.tipo_usuario]);
    }
})();

// ─── Reglas de validación ────────────────────────────────────────────────────
const USERNAME_MAX = 10;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 12;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const form            = document.getElementById('loginForm');
const usernameInput   = document.getElementById('username');
const passwordInput   = document.getElementById('password');
const toggleBtn       = document.getElementById('togglePwd');
const errorBox        = document.getElementById('errorBox');
const errorMsg        = document.getElementById('errorMsg');
const btnLogin        = document.getElementById('btnLogin');
const btnText         = document.getElementById('btnText');
const btnSpinner      = document.getElementById('btnSpinner');
const usernameGroup   = document.getElementById('usernameGroup');
const passwordGroup   = document.getElementById('passwordGroup');
const usernameCounter = document.getElementById('usernameCounter');
const passwordCounter = document.getElementById('passwordCounter');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.classList.add('visible');
    usernameGroup.classList.add('error');
    passwordGroup.classList.add('error');
}

function clearError() {
    errorBox.classList.remove('visible');
    usernameGroup.classList.remove('error');
    passwordGroup.classList.remove('error');
}

function setLoading(on) {
    btnLogin.disabled = on;
    btnText.classList.toggle('hidden', on);
    btnSpinner.classList.toggle('hidden', !on);
}

function updateCounter(span, current, max, min = 0) {
    span.textContent = `${current}/${max}`;
    span.classList.remove('warn', 'limit');
    if (current === max) {
        span.classList.add('limit');
    } else if (min > 0 && current > 0 && current < min) {
        span.classList.add('warn');
    }
}

// ─── Contador usuario ────────────────────────────────────────────────────────
usernameInput.addEventListener('input', () => {
    updateCounter(usernameCounter, usernameInput.value.length, USERNAME_MAX);
    clearError();
});

// ─── Contador contraseña: 8–10 caracteres ────────────────────────────────────
passwordInput.addEventListener('input', () => {
    const len = passwordInput.value.length;
    updateCounter(passwordCounter, len, PASSWORD_MAX, PASSWORD_MIN);
    clearError();
});

// ─── Toggle contraseña ────────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleBtn.classList.toggle('visible', isHidden);
    toggleBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

// ─── Submit ───────────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    // Validaciones client-side
    if (!username) {
        showError('El campo usuario es obligatorio.');
        usernameInput.focus();
        return;
    }
    if (!password) {
        showError('El campo contraseña es obligatorio.');
        passwordInput.focus();
        return;
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        showError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
        passwordInput.focus();
        return;
    }

    setLoading(true);
    clearError();

    try {
        const res = await fetch(LOGIN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            const msg = data.errores || data.detail || 'Credenciales inválidas.';
            showError(msg);
            return;
        }

        const tipo = data.user?.tipo_usuario;

        if (!TIPOS_PERMITIDOS.includes(tipo)) {
            showError('Acceso no permitido para este tipo de usuario.');
            return;
        }

        // Guardar tokens
        localStorage.setItem('access_token',  data.access);
        localStorage.setItem('refresh_token', data.refresh);
        localStorage.setItem('user',          JSON.stringify(data.user));

        // Redirigir según tipo
        window.location.href = REDIRECT[tipo];

    } catch {
        showError('Error de conexión. Verifique su red e intente nuevamente.');
    } finally {
        setLoading(false);
    }
});
