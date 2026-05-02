'use strict';

(function () {
    let _todas    = [];
    let _filtro   = 'todas';
    let _fecha    = '';
    let _pagina   = 0;
    let _expanded = new Set();
    let _fpInstance = null;

    const POR_PAGINA = 30;

    const panel    = document.getElementById('notifPanel');
    const backdrop = document.getElementById('notifBackdrop');
    const badge    = document.getElementById('notifBadge');
    const list     = document.getElementById('notifList');
    const btnAbrir = document.getElementById('btnNotifBell');
    const btnCerrar= document.getElementById('btnCerrarNotif');
    const footer   = document.getElementById('notifFooter');
    const btnPrev  = document.getElementById('notifPrev');
    const btnNext  = document.getElementById('notifNext');
    const pageInfo = document.getElementById('notifPageInfo');
    const panelMeta = document.getElementById('notifPanelMeta');

    if (!panel) return;

    document.querySelectorAll('.notif-tab').forEach(tab => {
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', tab.classList.contains('notif-tab--active') ? 'true' : 'false');
    });

    // ── Abrir / cerrar ────────────────────────────────────────────
    function abrir() {
        panel.style.display    = 'flex';
        backdrop.style.display = 'block';
        document.body.classList.add('notif-open');
        _initFlatpickr();
        _cargar();
    }
    function cerrar() {
        panel.style.display    = 'none';
        backdrop.style.display = 'none';
        document.body.classList.remove('notif-open');
        if (_fpInstance) _fpInstance.close();
    }

    btnAbrir.addEventListener('click', abrir);
    btnCerrar.addEventListener('click', cerrar);
    backdrop.addEventListener('click', cerrar);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && panel.style.display !== 'none') cerrar();
    });

    // ── Flatpickr ─────────────────────────────────────────────────
    function _initFlatpickr() {
        if (_fpInstance) return;
        const inputEl  = document.getElementById('notifFechaFiltroInput');
        const btnFecha = document.getElementById('notifFechaBtn');
        const btnClear = document.getElementById('notifFechaClear');
        if (!inputEl || !btnFecha) return;

        function _crear() {
            if (typeof flatpickr === 'undefined') return;

            // Definir locale español si la página no lo cargó
            if (!flatpickr.l10ns.es) {
                flatpickr.l10ns.es = {
                    firstDayOfWeek: 1,
                    weekdays: {
                        shorthand: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
                        longhand:  ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
                    },
                    months: {
                        shorthand: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
                        longhand:  ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                                    'Septiembre','Octubre','Noviembre','Diciembre'],
                    },
                    ordinal: () => 'º',
                    rangeSeparator: ' a ',
                    time_24hr: true,
                };
            }

            _fpInstance = flatpickr(inputEl, {
                locale: 'es',
                dateFormat: 'Y-m-d',
                disableMobile: true,
                onChange([date]) {
                    _fecha  = date ? date.toISOString().slice(0, 10) : '';
                    _pagina = 0;
                    _actualizarFechaUI();
                    _render();
                },
            });

            btnFecha.addEventListener('click', () => _fpInstance.toggle());
            btnClear.addEventListener('click', e => {
                e.stopPropagation();
                _fpInstance.clear();
                _fecha  = '';
                _pagina = 0;
                _actualizarFechaUI();
                _render();
            });
        }

        if (typeof flatpickr !== 'undefined') {
            _crear();
        } else {
            // Cargar flatpickr dinámicamente (páginas que no lo tienen)
            if (!document.querySelector('link[href*="flatpickr.min.css"]')) {
                const link = document.createElement('link');
                link.rel  = 'stylesheet';
                link.href = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css';
                document.head.appendChild(link);

                const darkLink = document.createElement('link');
                darkLink.rel  = 'stylesheet';
                darkLink.href = '/static/css/flatpickr-dark.css';
                document.head.appendChild(darkLink);
            }
            const script  = document.createElement('script');
            script.src    = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js';
            script.onload = _crear;
            document.head.appendChild(script);
        }
    }

    function _actualizarFechaUI() {
        const labelEl = document.getElementById('notifFechaLabel');
        const btnClear = document.getElementById('notifFechaClear');
        const btnFecha = document.getElementById('notifFechaBtn');
        if (_fecha) {
            const d = new Date(_fecha + 'T12:00:00');
            labelEl.textContent = d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
            btnClear.style.display = 'inline-flex';
            btnFecha.classList.add('notif-cal-btn--active');
        } else {
            labelEl.textContent = '';
            btnClear.style.display = 'none';
            btnFecha.classList.remove('notif-cal-btn--active');
        }
    }

    // ── Carga desde API ───────────────────────────────────────────
    async function _cargar() {
        list.innerHTML = '<div class="notif-loading">Cargando…</div>';
        const { ok, data } = await fetchAPI('/api/notifications/mis-notificaciones/');
        if (!ok) {
            list.innerHTML = '<div class="notif-empty">Error al cargar notificaciones.</div>';
            if (panelMeta) panelMeta.textContent = 'No se pudo actualizar el estado';
            return;
        }
        _todas = data;
        _actualizarBadge();
        _render();
    }

    // ── Badge ─────────────────────────────────────────────────────
    function _actualizarBadge() {
        const noLeidas = _todas.filter(n => !n.leida).length;
        _actualizarMeta(_todas.length, noLeidas);
        if (noLeidas > 0) {
            badge.textContent   = noLeidas > 99 ? '99+' : noLeidas;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // ── Tabs ──────────────────────────────────────────────────────
    document.getElementById('notifTabs').addEventListener('click', e => {
        const tab = e.target.closest('.notif-tab');
        if (!tab) return;
        document.querySelectorAll('.notif-tab').forEach(t => {
            t.classList.remove('notif-tab--active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('notif-tab--active');
        tab.setAttribute('aria-selected', 'true');
        _filtro = tab.dataset.filtro;
        _pagina = 0;
        _render();
    });

    // ── Paginación ────────────────────────────────────────────────
    btnPrev.addEventListener('click', () => { _pagina--; _render(); });
    btnNext.addEventListener('click', () => { _pagina++; _render(); });

    // ── Render ────────────────────────────────────────────────────
    function _render() {
        let items = _todas;
        if (_filtro === 'no_leidas') items = items.filter(n => !n.leida);
        if (_filtro === 'leidas')    items = items.filter(n =>  n.leida);
        if (_fecha) {
            items = items.filter(n => (n.fecha_creacion || '').slice(0, 10) === _fecha);
        }

        const totalFiltradas = items.length;
        const totalPaginas   = Math.max(1, Math.ceil(totalFiltradas / POR_PAGINA));
        _pagina = Math.min(_pagina, totalPaginas - 1);

        // Paginar
        items = items.slice(_pagina * POR_PAGINA, (_pagina + 1) * POR_PAGINA);

        // Footer de paginación
        if (totalPaginas > 1) {
            footer.style.display  = 'flex';
            pageInfo.textContent  = `${_pagina + 1} / ${totalPaginas}`;
            btnPrev.disabled      = _pagina === 0;
            btnNext.disabled      = _pagina >= totalPaginas - 1;
        } else {
            footer.style.display  = 'none';
        }

        if (!items.length) {
            list.innerHTML = `<div class="notif-empty">${_emptyMessage()}</div>`;
            return;
        }

        // Agrupar por fecha
        const grupos = {};
        items.forEach(n => {
            const fecha = (n.fecha_creacion || '').slice(0, 10) || 'Sin fecha';
            (grupos[fecha] = grupos[fecha] || []).push(n);
        });

        const hoy  = new Date().toISOString().slice(0, 10);
        const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        list.innerHTML = Object.keys(grupos).sort((a, b) => b.localeCompare(a)).map(fecha => {
            let label;
            if (fecha === hoy)       label = 'Hoy';
            else if (fecha === ayer) label = 'Ayer';
            else {
                const d = new Date(fecha + 'T12:00:00');
                label = d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
            }
            return `<div class="notif-group">
                        <div class="notif-group__label">${label}</div>
                        ${grupos[fecha].map(_itemHTML).join('')}
                    </div>`;
        }).join('');

        // Listeners: expandir + marcar leída
        list.querySelectorAll('.notif-item[data-id]').forEach(el => {
            const activar = () => {
                const id = parseInt(el.dataset.id);
                if (_expanded.has(id)) _expanded.delete(id);
                else                   _expanded.add(id);
                el.classList.toggle('notif-item--expanded', _expanded.has(id));
                _marcarLeida(id);
            };
            el.addEventListener('click', activar);
            el.addEventListener('keydown', e => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                activar();
            });
        });
    }

    function _itemHTML(n) {
        const hora     = n.fecha_creacion
            ? new Date(n.fecha_creacion).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
            : '';
        const expanded = _expanded.has(n.id);
        const emisor   = n.emisor_nombre && n.emisor_nombre !== 'Sistema'
            ? ' · ' + _esc(n.emisor_nombre) : '';
        return `
        <div class="notif-item${n.leida ? ' notif-item--leida' : ' notif-item--no-leida'}${expanded ? ' notif-item--expanded' : ''}" data-id="${n.id}" role="button" tabindex="0">
            <span class="notif-item__dot${n.leida ? ' notif-item__dot--leida' : ''}"></span>
            <div class="notif-item__body">
                <p class="notif-item__desc">${_esc(n.descripcion)}</p>
                <span class="notif-item__hora">${hora}${emisor}</span>
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

    // ── Badge inicial (sin abrir panel) ──────────────────────────
    async function _cargarBadge() {
        const { ok, data } = await fetchAPI('/api/notifications/mis-notificaciones/?no_leidas=true');
        if (!ok) return;
        _todas = data;
        _actualizarBadge();
    }

    function _esc(str) {
        return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function _actualizarMeta(total, noLeidas) {
        if (!panelMeta) return;
        if (!total) {
            panelMeta.textContent = 'No tienes avisos por revisar';
        } else if (noLeidas) {
            panelMeta.textContent = `${noLeidas} sin leer de ${total} ${total === 1 ? 'aviso' : 'avisos'}`;
        } else {
            panelMeta.textContent = `${total} ${total === 1 ? 'aviso' : 'avisos'} al día`;
        }
    }

    function _emptyMessage() {
        if (_fecha) return 'No hay notificaciones para la fecha seleccionada.';
        if (_filtro === 'no_leidas') return 'No tienes notificaciones sin leer.';
        if (_filtro === 'leidas') return 'No tienes notificaciones leídas.';
        return 'Sin notificaciones.';
    }

    _cargarBadge();
})();
