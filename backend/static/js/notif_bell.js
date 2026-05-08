'use strict';

(function () {
    let _recibidas = [];
    let _enviadas = [];
    let _recibidasCargadas = false;
    let _badgeNoLeidas = 0;
    let _scope = 'recibidas';
    let _filtro = 'todas';
    let _fecha = '';
    let _pagina = 0;
    let _expanded = new Set();
    let _fpInstance = null;
    let _cursosCargados = false;
    let _estudiantesCurso = [];
    const _customSelects = new Map();

    const POR_PAGINA = 30;

    const panel = document.getElementById('notifPanel');
    const backdrop = document.getElementById('notifBackdrop');
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    const btnAbrir = document.getElementById('btnNotifBell');
    const btnCerrar = document.getElementById('btnCerrarNotif');
    const footer = document.getElementById('notifFooter');
    const btnPrev = document.getElementById('notifPrev');
    const btnNext = document.getElementById('notifNext');
    const pageInfo = document.getElementById('notifPageInfo');
    const panelMeta = document.getElementById('notifPanelMeta');
    const scopeTabs = document.getElementById('notifScopeTabs');
    const btnNueva = document.getElementById('btnNuevaNotif');

    const composePanel = document.getElementById('notifComposePanel');
    const composeForm = document.getElementById('notifComposeForm');
    const btnCerrarCompose = document.getElementById('btnCerrarNotifCompose');
    const btnCancelarCompose = document.getElementById('btnCancelarNotifCompose');
    const btnEnviarCompose = document.getElementById('btnEnviarNotifCompose');
    const cursoSelect = document.getElementById('notifCursoSelect');
    const estudianteSelect = document.getElementById('notifEstudianteSelect');
    const descripcionInput = document.getElementById('notifDescripcionInput');
    const descripcionLimit = document.getElementById('notifDescripcionLimit');
    const tutorHint = document.getElementById('notifTutorHint');
    const composeError = document.getElementById('notifComposeError');

    if (!panel || !backdrop || !btnAbrir) return;

    document.querySelectorAll('.notif-tab').forEach(tab => {
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', tab.classList.contains('notif-tab--active') ? 'true' : 'false');
    });

    function abrir() {
        panel.style.display = 'flex';
        if (composePanel) composePanel.style.display = 'none';
        backdrop.style.display = 'block';
        document.body.classList.add('notif-open');
        _initFlatpickr();
        _cargarActual();
    }

    function cerrar() {
        panel.style.display = 'none';
        if (composePanel) composePanel.style.display = 'none';
        backdrop.style.display = 'none';
        document.body.classList.remove('notif-open');
        if (_fpInstance) _fpInstance.close();
    }

    function _panelVisible() {
        return panel.style.display !== 'none' && panel.style.display !== '';
    }

    btnAbrir.addEventListener('click', abrir);
    btnCerrar?.addEventListener('click', cerrar);
    backdrop.addEventListener('click', cerrar);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && (_panelVisible() || _composeVisible())) cerrar();
    });

    function _composeVisible() {
        return composePanel && composePanel.style.display !== 'none' && composePanel.style.display !== '';
    }

    function _initFlatpickr() {
        if (_fpInstance) return;
        const inputEl = document.getElementById('notifFechaFiltroInput');
        const btnFecha = document.getElementById('notifFechaBtn');
        const btnClear = document.getElementById('notifFechaClear');
        if (!inputEl || !btnFecha) return;

        function _crear() {
            if (typeof flatpickr === 'undefined') return;
            if (!flatpickr.l10ns.es) {
                flatpickr.l10ns.es = {
                    firstDayOfWeek: 1,
                    weekdays: {
                        shorthand: ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'],
                        longhand: ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'],
                    },
                    months: {
                        shorthand: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
                        longhand: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
                    },
                    ordinal: () => 'o',
                    rangeSeparator: ' a ',
                    time_24hr: true,
                };
            }

            _fpInstance = flatpickr(inputEl, {
                locale: 'es',
                dateFormat: 'Y-m-d',
                disableMobile: true,
                onChange([date]) {
                    _fecha = date ? date.toISOString().slice(0, 10) : '';
                    _pagina = 0;
                    _actualizarFechaUI();
                    _render();
                },
            });

            btnFecha.addEventListener('click', () => _fpInstance.toggle());
            btnClear?.addEventListener('click', e => {
                e.stopPropagation();
                _fpInstance.clear();
                _fecha = '';
                _pagina = 0;
                _actualizarFechaUI();
                _render();
            });
        }

        if (typeof flatpickr !== 'undefined') {
            _crear();
            return;
        }

        if (!document.querySelector('link[href*="flatpickr.min.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css';
            document.head.appendChild(link);

            const darkLink = document.createElement('link');
            darkLink.rel = 'stylesheet';
            darkLink.href = '/static/css/flatpickr-dark.css';
            document.head.appendChild(darkLink);
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js';
        script.onload = _crear;
        document.head.appendChild(script);
    }

    function _actualizarFechaUI() {
        const labelEl = document.getElementById('notifFechaLabel');
        const btnClear = document.getElementById('notifFechaClear');
        const btnFecha = document.getElementById('notifFechaBtn');
        if (!labelEl || !btnFecha) return;
        if (_fecha) {
            const d = new Date(_fecha + 'T12:00:00');
            labelEl.textContent = d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
            if (btnClear) btnClear.style.display = 'inline-flex';
            btnFecha.classList.add('notif-cal-btn--active');
        } else {
            labelEl.textContent = '';
            if (btnClear) btnClear.style.display = 'none';
            btnFecha.classList.remove('notif-cal-btn--active');
        }
    }

    async function _cargarActual() {
        list.innerHTML = '<div class="notif-loading">Cargando...</div>';
        const endpoint = _scope === 'enviadas'
            ? '/api/notifications/enviadas/'
            : '/api/notifications/mis-notificaciones/';

        const { ok, data } = await fetchAPI(endpoint);
        if (!ok) {
            list.innerHTML = '<div class="notif-empty">Error al cargar notificaciones.</div>';
            if (panelMeta) panelMeta.textContent = 'No se pudo actualizar el estado';
            return;
        }

        if (_scope === 'enviadas') {
            _enviadas = Array.isArray(data) ? data : [];
        } else {
            _recibidas = Array.isArray(data) ? data : [];
            _recibidasCargadas = true;
        }

        _actualizarBadge();
        _actualizarMeta();
        _render();
    }

    async function _cargarBadge() {
        const { ok, data } = await fetchAPI('/api/notifications/mis-notificaciones/?no_leidas=true');
        if (!ok) return;
        _badgeNoLeidas = Array.isArray(data) ? data.length : 0;
        _pintarBadge();
    }

    function _actualizarBadge() {
        if (_recibidasCargadas) _badgeNoLeidas = _recibidas.filter(n => !n.leida).length;
        _pintarBadge();
    }

    function _pintarBadge() {
        if (_badgeNoLeidas > 0) {
            badge.textContent = _badgeNoLeidas > 99 ? '99+' : _badgeNoLeidas;
            badge.style.display = 'flex';
            btnAbrir.classList.add('notif-bell--unread');
            btnAbrir.setAttribute('aria-label', `${_badgeNoLeidas} notificaciones sin leer`);
        } else {
            badge.style.display = 'none';
            badge.textContent = '';
            btnAbrir.classList.remove('notif-bell--unread');
            btnAbrir.setAttribute('aria-label', 'Notificaciones');
        }
    }

    function _actualizarMeta() {
        if (!panelMeta) return;
        const items = _scope === 'enviadas' ? _enviadas : _recibidas;
        const noLeidas = items.filter(n => !n.leida).length;

        if (_scope === 'enviadas') {
            if (!items.length) panelMeta.textContent = 'No enviaste avisos todavia';
            else if (noLeidas) panelMeta.textContent = `${noLeidas} sin leer de ${items.length} enviados`;
            else panelMeta.textContent = `${items.length} enviados leidos`;
            return;
        }

        if (!items.length) panelMeta.textContent = 'No tienes avisos por revisar';
        else if (noLeidas) panelMeta.textContent = `${noLeidas} sin leer de ${items.length} ${items.length === 1 ? 'aviso' : 'avisos'}`;
        else panelMeta.textContent = `${items.length} ${items.length === 1 ? 'aviso' : 'avisos'} al dia`;
    }

    scopeTabs?.addEventListener('click', e => {
        const tab = e.target.closest('.notif-scope-tab');
        if (!tab) return;
        scopeTabs.querySelectorAll('.notif-scope-tab').forEach(t => {
            t.classList.remove('notif-scope-tab--active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('notif-scope-tab--active');
        tab.setAttribute('aria-selected', 'true');
        _scope = tab.dataset.scope || 'recibidas';
        _pagina = 0;
        _expanded.clear();
        _cargarActual();
    });

    document.getElementById('notifTabs')?.addEventListener('click', e => {
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

    btnPrev?.addEventListener('click', () => { _pagina--; _render(); });
    btnNext?.addEventListener('click', () => { _pagina++; _render(); });

    function _render() {
        let items = _scope === 'enviadas' ? _enviadas : _recibidas;
        if (_filtro === 'no_leidas') items = items.filter(n => !n.leida);
        if (_filtro === 'leidas') items = items.filter(n => n.leida);
        if (_fecha) items = items.filter(n => (n.fecha_creacion || '').slice(0, 10) === _fecha);

        const totalFiltradas = items.length;
        const totalPaginas = Math.max(1, Math.ceil(totalFiltradas / POR_PAGINA));
        _pagina = Math.min(_pagina, totalPaginas - 1);
        items = items.slice(_pagina * POR_PAGINA, (_pagina + 1) * POR_PAGINA);

        if (totalPaginas > 1) {
            footer.style.display = 'flex';
            pageInfo.textContent = `${_pagina + 1} / ${totalPaginas}`;
            btnPrev.disabled = _pagina === 0;
            btnNext.disabled = _pagina >= totalPaginas - 1;
        } else {
            footer.style.display = 'none';
        }

        if (!items.length) {
            list.innerHTML = `<div class="notif-empty">${_emptyMessage()}</div>`;
            return;
        }

        const grupos = {};
        items.forEach(n => {
            const fecha = (n.fecha_creacion || '').slice(0, 10) || 'Sin fecha';
            (grupos[fecha] = grupos[fecha] || []).push(n);
        });

        const hoy = new Date().toISOString().slice(0, 10);
        const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        list.innerHTML = Object.keys(grupos).sort((a, b) => b.localeCompare(a)).map(fecha => {
            let label;
            if (fecha === hoy) label = 'Hoy';
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

        list.querySelectorAll('.notif-item[data-id]').forEach(el => {
            const activar = () => {
                const id = parseInt(el.dataset.id, 10);
                if (_expanded.has(id)) _expanded.delete(id);
                else _expanded.add(id);
                el.classList.toggle('notif-item--expanded', _expanded.has(id));
                if (_scope === 'recibidas') _marcarLeida(id);
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
        const hora = n.fecha_creacion
            ? new Date(n.fecha_creacion).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
            : '';
        const expanded = _expanded.has(n.id);
        const nombre = _scope === 'enviadas'
            ? (n.receptor_nombre ? `Para ${_esc(n.receptor_nombre)}` : 'Destinatario')
            : (n.emisor_nombre && n.emisor_nombre !== 'Sistema' ? _esc(n.emisor_nombre) : 'Sistema');
        const tipo = _scope === 'enviadas' && n.receptor_tipo ? ` - ${_esc(n.receptor_tipo)}` : '';
        const estado = _scope === 'enviadas' ? (n.leida ? 'Leida' : 'No leida') : '';
        return `
        <div class="notif-item${n.leida ? ' notif-item--leida' : ' notif-item--no-leida'}${expanded ? ' notif-item--expanded' : ''}" data-id="${n.id}" role="button" tabindex="0">
            <span class="notif-item__dot${n.leida ? ' notif-item__dot--leida' : ''}"></span>
            <div class="notif-item__body">
                <p class="notif-item__desc">${_esc(n.descripcion)}</p>
                <span class="notif-item__hora">${hora} - ${nombre}${tipo}${estado ? ' - ' + estado : ''}</span>
            </div>
        </div>`;
    }

    async function _marcarLeida(id) {
        const notif = _recibidas.find(n => n.id === id);
        if (!notif || notif.leida) return;
        const { ok } = await fetchAPI(`/api/notifications/${id}/leer/`, { method: 'PATCH' });
        if (!ok) return;
        notif.leida = true;
        _actualizarBadge();
        _actualizarMeta();
        _render();
    }

    function _emptyMessage() {
        if (_fecha) return 'No hay notificaciones para la fecha seleccionada.';
        if (_scope === 'enviadas') {
            if (_filtro === 'no_leidas') return 'No tienes notificaciones enviadas sin leer.';
            if (_filtro === 'leidas') return 'No tienes notificaciones enviadas leidas.';
            return 'No enviaste notificaciones.';
        }
        if (_filtro === 'no_leidas') return 'No tienes notificaciones sin leer.';
        if (_filtro === 'leidas') return 'No tienes notificaciones leidas.';
        return 'Sin notificaciones.';
    }

    btnNueva?.addEventListener('click', () => _abrirCompose());
    btnCerrarCompose?.addEventListener('click', () => _cerrarCompose(true));
    btnCancelarCompose?.addEventListener('click', () => _cerrarCompose(true));
    descripcionInput?.addEventListener('input', _actualizarLimiteDescripcion);
    cursoSelect?.addEventListener('change', () => _cargarEstudiantesCurso(cursoSelect.value));
    estudianteSelect?.addEventListener('change', _actualizarTutorHint);
    composeForm?.addEventListener('submit', _enviarNotificacion);
    _enhanceSelect(cursoSelect);
    _enhanceSelect(estudianteSelect);
    document.addEventListener('click', e => {
        if (!e.target.closest('.notif-custom-select')) _cerrarCustomSelects();
    });

    async function _abrirCompose() {
        if (!composePanel) return;
        panel.style.display = 'none';
        backdrop.style.display = 'block';
        composePanel.style.display = 'flex';
        document.body.classList.add('notif-open');
        _limpiarCompose(true);
        await _cargarCursos();
        setTimeout(() => cursoSelect?.focus(), 80);
    }

    function _cerrarCompose(volverAlPanel) {
        if (!composePanel) return;
        composePanel.style.display = 'none';
        if (volverAlPanel) {
            panel.style.display = 'flex';
            backdrop.style.display = 'block';
            document.body.classList.add('notif-open');
        } else {
            cerrar();
        }
    }

    function _limpiarCompose(limpiarCurso) {
        if (composeError) {
            composeError.textContent = '';
            composeError.style.display = 'none';
        }
        if (descripcionInput) descripcionInput.value = '';
        _actualizarLimiteDescripcion();
        if (tutorHint) tutorHint.textContent = '';
        if (estudianteSelect) {
            estudianteSelect.innerHTML = '<option value="">Selecciona un curso primero</option>';
            estudianteSelect.disabled = true;
            _syncCustomSelect(estudianteSelect);
        }
        _estudiantesCurso = [];
        if (limpiarCurso && cursoSelect) {
            cursoSelect.value = '';
            _syncCustomSelect(cursoSelect);
        }
    }

    async function _cargarCursos() {
        if (!cursoSelect || _cursosCargados) return;
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        const esProfesor = user?.tipo_usuario === 'Profesor';
        const endpoint = esProfesor ? '/api/academics/profesor/cursos/' : '/api/academics/cursos/';

        cursoSelect.innerHTML = '<option value="">Cargando cursos...</option>';
        cursoSelect.disabled = true;
        _syncCustomSelect(cursoSelect);
        const { ok, data } = await fetchAPI(endpoint);
        cursoSelect.disabled = false;

        if (!ok || !Array.isArray(data) || !data.length) {
            cursoSelect.innerHTML = '<option value="">Sin cursos disponibles</option>';
            _syncCustomSelect(cursoSelect);
            return;
        }

        cursoSelect.innerHTML = '<option value="">Selecciona un curso</option>'
            + data.map(c => `<option value="${_esc(c.id)}">${_esc(`${c.grado} ${c.paralelo}`.trim())}</option>`).join('');
        _cursosCargados = true;
        _syncCustomSelect(cursoSelect);
    }

    async function _cargarEstudiantesCurso(cursoId) {
        if (!estudianteSelect || !tutorHint) return;
        tutorHint.textContent = '';
        if (!cursoId) {
            estudianteSelect.innerHTML = '<option value="">Selecciona un curso primero</option>';
            estudianteSelect.disabled = true;
            _estudiantesCurso = [];
            _syncCustomSelect(estudianteSelect);
            return;
        }

        estudianteSelect.disabled = true;
        estudianteSelect.innerHTML = '<option value="">Cargando estudiantes...</option>';
        _syncCustomSelect(estudianteSelect);
        const { ok, data } = await fetchAPI(`/api/students/curso/${cursoId}/estudiantes/`);
        if (!ok || !Array.isArray(data)) {
            estudianteSelect.innerHTML = '<option value="">No se pudo cargar estudiantes</option>';
            _syncCustomSelect(estudianteSelect);
            return;
        }

        _estudiantesCurso = data.filter(e => e.tiene_tutor && e.tutor_id);
        if (!_estudiantesCurso.length) {
            estudianteSelect.innerHTML = '<option value="">Sin estudiantes con tutor</option>';
            tutorHint.textContent = 'Este curso no tiene estudiantes con tutor registrado.';
            _syncCustomSelect(estudianteSelect);
            return;
        }

        estudianteSelect.innerHTML = '<option value="">Selecciona estudiante</option>'
            + _estudiantesCurso.map(e => {
                const nombre = _nombreEstudiante(e);
                return `<option value="${_esc(e.tutor_id)}" data-estudiante-id="${_esc(e.id)}">${_esc(nombre)}</option>`;
            }).join('');
        estudianteSelect.disabled = false;
        _syncCustomSelect(estudianteSelect);
    }

    function _actualizarTutorHint() {
        if (!estudianteSelect || !tutorHint) return;
        const opt = estudianteSelect.selectedOptions[0];
        if (!opt || !opt.value) {
            tutorHint.textContent = '';
            return;
        }
        const est = _estudiantesCurso.find(e => String(e.id) === String(opt.dataset.estudianteId));
        if (!est) {
            tutorHint.textContent = '';
            return;
        }
        tutorHint.textContent = est.tutor_tiene_fcm
            ? 'El tutor recibira la notificacion en la app y quedara guardada.'
            : 'El tutor no tiene app activa; la notificacion quedara guardada en BD.';
    }

    async function _enviarNotificacion(e) {
        e.preventDefault();
        if (!estudianteSelect || !descripcionInput || !btnEnviarCompose) return;

        const receptorId = estudianteSelect.value;
        const descripcion = descripcionInput.value.trim();
        if (!receptorId) return _mostrarComposeError('Selecciona un estudiante con tutor.');
        if (!descripcion) return _mostrarComposeError('Escribe el mensaje de la notificacion.');
        if (descripcion.length > 120) return _mostrarComposeError('El mensaje no puede superar 120 caracteres.');

        btnEnviarCompose.disabled = true;
        btnEnviarCompose.textContent = 'Enviando...';
        if (composeError) composeError.style.display = 'none';

        const { ok, data } = await fetchAPI('/api/notifications/enviar/', {
            method: 'POST',
            body: JSON.stringify({ receptor_id: receptorId, descripcion }),
        });

        btnEnviarCompose.disabled = false;
        btnEnviarCompose.textContent = 'Enviar notificación';

        if (!ok) {
            _mostrarComposeError(data?.errores || 'No se pudo enviar la notificacion.');
            return;
        }

        if (typeof showAppToast === 'function') {
            showAppToast('success', 'Notificacion enviada', `Se envio a ${data?.receptor_nombre || 'el tutor'}.`);
        }
        _limpiarCompose(true);
        _scope = 'enviadas';
        scopeTabs?.querySelectorAll('.notif-scope-tab').forEach(t => {
            const activa = t.dataset.scope === 'enviadas';
            t.classList.toggle('notif-scope-tab--active', activa);
            t.setAttribute('aria-selected', activa ? 'true' : 'false');
        });
        _cerrarCompose(true);
        await _cargarActual();
    }

    function _mostrarComposeError(msg) {
        if (!composeError) return;
        composeError.textContent = msg;
        composeError.style.display = 'block';
    }

    function _actualizarLimiteDescripcion() {
        if (!descripcionInput || !descripcionLimit) return;
        descripcionLimit.style.display = descripcionInput.value.length >= 120 ? 'block' : 'none';
    }

    function _nombreEstudiante(e) {
        const apellidos = e.apellidos || `${e.apellido_paterno || ''} ${e.apellido_materno || ''}`.trim();
        return `${apellidos || ''} ${e.nombre || ''}`.replace(/\s+/g, ' ').trim();
    }

    function _enhanceSelect(select) {
        if (!select || _customSelects.has(select)) return;

        select.classList.add('notif-native-select');

        const wrap = document.createElement('div');
        wrap.className = 'notif-custom-select';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notif-custom-select__button';
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');

        const value = document.createElement('span');
        value.className = 'notif-custom-select__value';

        const icon = document.createElement('span');
        icon.className = 'notif-custom-select__chevron';
        icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>`;

        const menu = document.createElement('div');
        menu.className = 'notif-custom-select__menu';
        menu.setAttribute('role', 'listbox');

        button.append(value, icon);
        wrap.append(button, menu);
        select.insertAdjacentElement('afterend', wrap);

        button.addEventListener('click', e => {
            e.stopPropagation();
            if (select.disabled) return;
            const open = wrap.classList.contains('notif-custom-select--open');
            _cerrarCustomSelects();
            if (!open) {
                wrap.classList.add('notif-custom-select--open');
                button.setAttribute('aria-expanded', 'true');
            }
        });

        _customSelects.set(select, { wrap, button, value, menu });
        _syncCustomSelect(select);
    }

    function _syncCustomSelect(select) {
        const custom = select ? _customSelects.get(select) : null;
        if (!custom) return;

        const { wrap, button, value, menu } = custom;
        const selected = select.selectedOptions[0] || select.options[0];
        value.textContent = selected ? selected.textContent : 'Selecciona una opción';
        button.disabled = select.disabled;
        wrap.classList.toggle('notif-custom-select--disabled', select.disabled);

        menu.innerHTML = Array.from(select.options).filter(option => option.value !== '').map(option => {
            const active = option.value === select.value;
            return `
                <button type="button"
                        class="notif-custom-select__option${active ? ' notif-custom-select__option--active' : ''}"
                        data-value="${_esc(option.value)}"
                        role="option"
                        aria-selected="${active ? 'true' : 'false'}">
                    ${_esc(option.textContent)}
                </button>`;
        }).join('');

        if (!menu.innerHTML) {
            menu.innerHTML = '<div class="notif-custom-select__empty">Sin opciones disponibles</div>';
        }

        menu.querySelectorAll('.notif-custom-select__option').forEach(optionBtn => {
            optionBtn.addEventListener('click', e => {
                e.stopPropagation();
                select.value = optionBtn.dataset.value || '';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                _cerrarCustomSelects();
                _syncCustomSelect(select);
            });
        });
    }

    function _cerrarCustomSelects() {
        _customSelects.forEach(({ wrap, button }) => {
            wrap.classList.remove('notif-custom-select--open');
            button.setAttribute('aria-expanded', 'false');
        });
    }

    function _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _cargarBadge();
})();
