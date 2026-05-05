'use strict';

        // ── Auth guard ───────────────────────────────────────────────
        const _token = localStorage.getItem('access_token');
        const _user  = JSON.parse(localStorage.getItem('user') || 'null');
        if (!_token || !_user || _user.tipo_usuario !== 'Profesor') {
            window.location.replace('/login/');
        }

        // ── Nombre de perfil ─────────────────────────────────────────
        if (_user) {
            const name = [_user.first_name, _user.last_name].filter(Boolean).join(' ') || _user.username;
            document.getElementById('profileName').textContent  = "Republica de Francia 'A'";
            document.getElementById('profileRole').textContent  = 'Docente';
            document.getElementById('pageSubtitle').textContent = name;
        }

        // ── Sidebar expand / toggle ──────────────────────────────────
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

        // Por si el cursor ya está sobre el sidebar al cargar la página
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

        document.getElementById('btnBackCalificaciones').addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
                return;
            }
            window.location.href = '/profesor/';
        });

        // ── Navegación sidebar ───────────────────────────────────────
        document.getElementById('sideNotas').addEventListener('click',      () => window.location.href = '/profesor/');
        document.getElementById('sideCitaciones').addEventListener('click', () => window.location.href = '/profesor/citaciones/');
        document.getElementById('sidePlan').addEventListener('click',       () => window.location.href = '/profesor/plan/');
        document.getElementById('sideCuenta').addEventListener('click',     () => window.location.href = '/profesor/cuenta/');

        // ── Logout ───────────────────────────────────────────────────
        document.getElementById('btnLogout').addEventListener('click', () => {
            localStorage.clear();
            window.location.replace('/login/');
        });
