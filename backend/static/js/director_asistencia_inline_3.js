// ── Perfil ───────────────────────────────────────────────────
    const _user = JSON.parse(localStorage.getItem('user') || 'null');
    if (_user) {
        const nombre = `${_user.first_name || ''} ${_user.last_name || ''}`.trim() || _user.username;
        document.getElementById('profileName').textContent = "Republica de Francia 'A'";
        document.getElementById('profileRole').textContent = _user.tipo_usuario || 'Administración';
    }

    // ── Sidebar ──────────────────────────────────────────────────
    const sidebar  = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const btnMenu  = document.getElementById('btnMenu');
    const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
    let _leaveTimer;
    sidebar.addEventListener('mouseenter', () => { clearTimeout(_leaveTimer); if (isDesktop()) sidebar.classList.add('sidebar--expanded'); });
    sidebar.addEventListener('mouseleave', () => { if (isDesktop()) _leaveTimer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200); });
    document.addEventListener('mousemove', function _check(e) {
        document.removeEventListener('mousemove', _check);
        if (!isDesktop()) return;
        const r = sidebar.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
            sidebar.classList.add('sidebar--expanded');
    });
    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open')
            ? (sidebar.classList.remove('sidebar--open'), backdrop.classList.remove('visible'))
            : (sidebar.classList.add('sidebar--open'),   backdrop.classList.add('visible'))
    );
    backdrop.addEventListener('click', () => { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); });

    // ── Logout ───────────────────────────────────────────────────
    document.getElementById('btnLogout').addEventListener('click', async () => {
        if (typeof logoutFCM === 'function') await logoutFCM();
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });

    // ── Broadcast ────────────────────────────────────────────────
    (function () {
        const bd = document.getElementById('broadcastBackdrop');
        const btnOpen = document.getElementById('btnBroadcast');
        const btnClose = document.getElementById('broadcastCancelar');
        const btnSend = document.getElementById('broadcastEnviar');
        const inpTit = document.getElementById('broadcastTitulo');
        const inpMsg = document.getElementById('broadcastCuerpo');
        const errEl  = document.getElementById('broadcastError');
        const open  = () => { bd.classList.add('visible'); inpTit.focus(); };
        const close = () => { bd.classList.remove('visible'); inpTit.value = ''; inpMsg.value = ''; errEl.style.display = 'none'; btnSend.disabled = false; btnSend.textContent = 'Enviar'; };
        btnOpen.addEventListener('click', open);
        btnClose.addEventListener('click', close);
        bd.addEventListener('click', e => { if (e.target === bd) close(); });
        btnSend.addEventListener('click', async () => {
            const titulo = inpTit.value.trim(), cuerpo = inpMsg.value.trim();
            errEl.style.display = 'none';
            if (!titulo || !cuerpo) { errEl.textContent = 'Completa el título y el mensaje.'; errEl.style.display = 'block'; return; }
            btnSend.disabled = true; btnSend.textContent = 'Enviando...';
            const { ok, data } = await fetchAPI('/api/notifications/broadcast/', { method: 'POST', body: JSON.stringify({ titulo, cuerpo }) });
            if (!ok) { btnSend.disabled = false; btnSend.textContent = 'Enviar'; return; }
            if (data?.sin_dispositivos) { errEl.textContent = 'No hay dispositivos registrados.'; errEl.style.display = 'block'; btnSend.disabled = false; btnSend.textContent = 'Enviar'; return; }
            close();
        });
    })();
