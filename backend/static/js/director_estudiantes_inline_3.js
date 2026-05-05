/* ── Sidebar ─────────────────────────────────────────────── */
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
    let _leaveTimer;
    sidebar.addEventListener('mouseenter', () => {
        clearTimeout(_leaveTimer);
        if (isDesktop()) sidebar.classList.add('sidebar--expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
        if (isDesktop()) _leaveTimer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200);
    });
    document.addEventListener('mousemove', function _checkSidebar(e) {
        document.removeEventListener('mousemove', _checkSidebar);
        if (!isDesktop()) return;
        const r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            sidebar.classList.add('sidebar--expanded');
        }
    });

    function openSidebar()  { sidebar.classList.add('sidebar--open');    backdrop.classList.add('visible'); }
    function closeSidebar() { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); }

    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()
    );
    backdrop.addEventListener('click', closeSidebar);

    // Bloquear links "#" (pantallas aún no implementadas)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            const href = item.getAttribute('href');
            if (!href || href === '#') e.preventDefault();
        });
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });
