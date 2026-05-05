const _user = JSON.parse(localStorage.getItem('user') || 'null');
    const _nombreDir = _user ? (`${_user.first_name || ''} ${_user.last_name || ''}`.trim() || _user.username) : '';
    if (_user) {
        document.getElementById('profileName').textContent = "Republica de Francia 'A'";
        document.getElementById('profileRole').textContent = _user.tipo_usuario || 'Administración';
        document.getElementById('pageTitle').textContent   = `Panel de ${_nombreDir}`;
    }

    // ── Hamburguesa (móvil/tablet) ───────────────────────────────
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

    // Si la página carga con el cursor ya encima del sidebar, expandirlo en el primer movimiento
    document.addEventListener('mousemove', function _checkSidebar(e) {
        document.removeEventListener('mousemove', _checkSidebar);
        if (!isDesktop()) return;
        const r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            sidebar.classList.add('sidebar--expanded');
        }
    });

    function openSidebar() {
        sidebar.classList.add('sidebar--open');
        backdrop.classList.add('visible');
    }
    function closeSidebar() {
        sidebar.classList.remove('sidebar--open');
        backdrop.classList.remove('visible');
    }

    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open') ? closeSidebar() : openSidebar()
    );
    backdrop.addEventListener('click', closeSidebar);

    // Cambio de sección: si el href es "#" solo actualiza título/activo,
    // si tiene ruta real deja navegar normalmente.
    const pageTitle = document.getElementById('pageTitle');
    document.querySelectorAll('.nav-item[data-title]').forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            if (!href || href === '#') {
                e.preventDefault();
                pageTitle.textContent = `Panel de ${_nombreDir}`;
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            }
            // Si tiene href real → navega normalmente (no se previene)
        });
    });

    document.getElementById('btnLogout').addEventListener('click', async () => {
        await logoutFCM();
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });
