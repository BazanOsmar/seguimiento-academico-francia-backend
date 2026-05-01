'use strict';

(function () {
    let _todas = [];
    let _filtro = 'todas';   // todas | no_leidas | leidas
    let _fecha  = '';

    const panel    = document.getElementById('notifPanel');
    const backdrop = document.getElementById('notifBackdrop');
    const badge    = document.getElementById('notifBadge');
    const list     = document.getElementById('notifList');
    const btnAbrir = document.getElementById('btnNotifBell');
    const btnCerrar= document.getElementById('btnCerrarNotif');
    const inputFecha = document.getElementById('notifFechaFiltro');

    if (!panel) return;

    // ── Abrir / cerrar ────────────────────────────────────────────
    function abrir() {
        panel.style.display    = 'flex';
        backdrop.style.display = 'block';
        _cargar();
    }
    function cerrar() {
        panel.style.display    = 'none';
        backdrop.style.display = 'none';
    }

    btnAbrir.addEventListener('click', abrir);
    btnCerrar.addEventListener('click', cerrar);
    backdrop.addEventListener('click', cerrar);

    // ── Carga desde API ───────────────────────────────────────────
    async function _cargar() {
        list.innerHTML = '<div class="notif-loading">Cargando…</div>';
        const { ok, data } = await fetchAPI('/api/notifications/mis-notificaciones/');
        if (!ok) {
            list.innerHTML = '<div class="notif-empty">Error al cargar notificaciones.</div>';
            return;
        }
        _todas = data;
        _actualizarBadge();
        _render();
    }

    // ── Badge ─────────────────────────────────────────────────────
    function _actualizarBadge() {
        const noLeidas = _todas.filter(n => !n.leida).length;
        if (noLeidas > 0) {
            badge.textContent = noLeidas > 99 ? '99+' : noLeidas;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // ── Filtros ───────────────────────────────────────────────────
    document.getElementById('notifTabs').addEventListener('click', e => {
        const tab = e.target.closest('.notif-tab');
        if (!tab) return;
        document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('notif-tab--active'));
        tab.classList.add('notif-tab--active');
        _filtro = tab.dataset.filtro;
        _render();
    });

    inputFecha.addEventListener('change', () => {
        _fecha = inputFecha.value;
        _render();
    });

    // ── Render ────────────────────────────────────────────────────
    function _render() {
        let items = _todas;

        if (_filtro === 'no_leidas') items = items.filter(n => !n.leida);
        if (_filtro === 'leidas')    items = items.filter(n => n.leida);

        if (_fecha) {
            items = items.filter(n => {
                const d = n.fecha_creacion ? n.fecha_creacion.slice(0, 10) : '';
                return d === _fecha;
            });
        }

        if (!items.length) {
            list.innerHTML = '<div class="notif-empty">Sin notificaciones.</div>';
            return;
        }

        // Agrupar por fecha
        const grupos = {};
        items.forEach(n => {
            const fecha = n.fecha_creacion ? n.fecha_creacion.slice(0, 10) : 'Sin fecha';
            grupos[fecha] = grupos[fecha] || [];
            grupos[fecha].push(n);
        });

        const fechasOrdenadas = Object.keys(grupos).sort((a, b) => b.localeCompare(a));
        const hoy   = new Date().toISOString().slice(0, 10);
        const ayer  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        list.innerHTML = fechasOrdenadas.map(fecha => {
            let label;
            if (fecha === hoy)  label = 'Hoy';
            else if (fecha === ayer) label = 'Ayer';
            else {
                const d = new Date(fecha + 'T12:00:00');
                label = d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
            }

            const itemsHTML = grupos[fecha].map(n => _itemHTML(n)).join('');
            return `<div class="notif-group">
                        <div class="notif-group__label">${label}</div>
                        ${itemsHTML}
                    </div>`;
        }).join('');

        // Listeners de cada ítem
        list.querySelectorAll('.notif-item[data-id]').forEach(el => {
            el.addEventListener('click', () => _marcarLeida(parseInt(el.dataset.id)));
        });
    }

    function _itemHTML(n) {
        const hora = n.fecha_creacion
            ? new Date(n.fecha_creacion).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
            : '';
        const leida = n.leida;
        return `
        <div class="notif-item${leida ? ' notif-item--leida' : ' notif-item--no-leida'}" data-id="${n.id}">
            <span class="notif-item__dot${leida ? ' notif-item__dot--leida' : ''}"></span>
            <div class="notif-item__body">
                <p class="notif-item__desc">${_esc(n.descripcion)}</p>
                <span class="notif-item__hora">${hora}${n.emisor_nombre && n.emisor_nombre !== 'Sistema' ? ' · ' + _esc(n.emisor_nombre) : ''}</span>
            </div>
        </div>`;
    }

    // ── Marcar leída ──────────────────────────────────────────────
    async function _marcarLeida(id) {
        const notif = _todas.find(n => n.id === id);
        if (!notif || notif.leida) return;

        const { ok } = await fetchAPI(`/api/notifications/${id}/leer/`, { method: 'PATCH' });
        if (!ok) return;

        notif.leida = true;
        _actualizarBadge();
        _render();
    }

    // ── Carga inicial del badge (sin abrir el panel) ──────────────
    async function _cargarBadge() {
        const { ok, data } = await fetchAPI('/api/notifications/mis-notificaciones/?no_leidas=true');
        if (!ok) return;
        _todas = data;
        _actualizarBadge();
    }

    function _esc(str) {
        return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    _cargarBadge();
})();
