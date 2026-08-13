'use strict';

const _token = localStorage.getItem('access_token');
const _user  = JSON.parse(localStorage.getItem('user') || 'null');
if (!_token || !_user || _user.tipo_usuario !== 'Director') {
    window.location.replace('/login/');
}

if (_user) {
    const name = [_user.first_name, _user.last_name].filter(Boolean).join(' ') || _user.username;
    document.getElementById('profileName').textContent = "Republica de Francia 'A'";
    document.getElementById('profileRole').textContent = 'Administración';
    document.getElementById('pageSubtitle').textContent = name;
}

const _sidebar  = document.querySelector('.sidebar');
const _backdrop = document.getElementById('sidebarBackdrop');
const _isDesktop = () => window.matchMedia('(min-width: 769px)').matches;

let _leaveTimer;
_sidebar.addEventListener('mouseenter', () => {
    clearTimeout(_leaveTimer);
    if (_isDesktop()) _sidebar.classList.add('sidebar--expanded');
});
_sidebar.addEventListener('mouseleave', () => {
    if (_isDesktop())
        _leaveTimer = setTimeout(() => _sidebar.classList.remove('sidebar--expanded'), 200);
});

document.addEventListener('mousemove', function _check(e) {
    document.removeEventListener('mousemove', _check);
    if (!_isDesktop()) return;
    const r = _sidebar.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top  && e.clientY <= r.bottom) {
        _sidebar.classList.add('sidebar--expanded');
    }
});

document.getElementById('btnMenu').addEventListener('click', () => {
    _sidebar.classList.toggle('sidebar--open');
    _backdrop.classList.toggle('visible');
});
_backdrop.addEventListener('click', () => {
    _sidebar.classList.remove('sidebar--open');
    _backdrop.classList.remove('visible');
});

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.clear();
    window.location.replace('/login/');
});

// ── Volver a Control Calificaciones (visible solo en modo "carga") ────
const _btnBackCalificaciones = document.getElementById('btnBackCalificaciones');
if (_btnBackCalificaciones) {
    _btnBackCalificaciones.addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const profId = params.get('prof_id');
        const mes    = params.get('mes') || params.get('mes_hasta');
        const target = new URLSearchParams({ pivot: 'notas' });
        if (mes)    target.set('mes', mes);
        if (profId) target.set('abrir_profesor', profId);
        window.location.href = `/director/academico/?${target.toString()}`;
    });
}
