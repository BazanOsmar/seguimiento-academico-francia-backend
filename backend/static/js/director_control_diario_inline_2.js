const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        
        function hoyBolivia() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' }); }
        function fechaHeroTexto(f) { const [y, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1]} - ${y}`; }
        function diaSemana(f) { const [y, m, d] = f.split('-').map(Number); return DIAS[new Date(y, m - 1, d).getDay()]; }

        const _u = JSON.parse(localStorage.getItem('user') || '{}');
        document.getElementById('profileName').textContent = `${_u.first_name || ''} ${_u.last_name || ''}`.trim() || _u.username;
        document.getElementById('profileRole').textContent = _u.tipo_usuario || 'Administración';
        
        const sidebar = document.querySelector('.sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        const btnMenu = document.getElementById('btnMenu');
        const isDesktop = () => window.innerWidth > 768;
        let _leaveTimer = null;

        sidebar.addEventListener('mouseenter', () => {
            clearTimeout(_leaveTimer);
            if (isDesktop()) sidebar.classList.add('sidebar--expanded');
        });
        sidebar.addEventListener('mouseleave', () => {
            if (isDesktop()) {
                _leaveTimer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200);
            }
        });
        document.addEventListener('mousemove', e => {
            if (!isDesktop() || sidebar.classList.contains('sidebar--expanded')) return;
            const r = sidebar.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                sidebar.classList.add('sidebar--expanded');
            }
        }, { once: true });

        btnMenu.addEventListener('click', () =>
            sidebar.classList.contains('sidebar--open')
                ? (sidebar.classList.remove('sidebar--open'), backdrop.classList.remove('visible'))
                : (sidebar.classList.add('sidebar--open'), backdrop.classList.add('visible'))
        );
        backdrop.addEventListener('click', () => {
            sidebar.classList.remove('sidebar--open');
            backdrop.classList.remove('visible');
        });
        document.getElementById('btnLogout').onclick = () => { localStorage.clear(); window.location.replace('/login/'); };

        // Tabs
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                tabContents.forEach(c => c.classList.remove('active'));
                document.getElementById(btn.dataset.tab).classList.add('active');
            };
        });

        const inputFecha = document.getElementById('inputFecha');
        let _cursosCache = [];

        async function cargarTodo() {
            const f = inputFecha.value;
            if (!f) return;
            await Promise.all([cargarAsistencia(f), cargarActividadRegente(f), cargarCitaciones(f), cargarSinUniforme(f)]);
        }

        async function cargarAsistencia(f) {
            const grid = document.getElementById('cursosGrid');
            grid.innerHTML = '<div class="grid-loading"><div class="grid-spinner"></div> Cargando cursos...</div>';
            
            const [cRes, eRes] = await Promise.all([fetchAPI('/api/academics/cursos/'), fetchAPI(`/api/attendance/estado-diario/?fecha=${f}`)]);
            if (!cRes.ok || !eRes.ok) { grid.innerHTML = '<div class="grid-loading">Error al cargar datos.</div>'; return; }
            
            _cursosCache = cRes.data;
            const sesiones = eRes.data.sesiones || [];
            const sesMap = {}; sesiones.forEach(s => sesMap[s.curso_id] = s);
            
            let ok = 0, no = 0;
            grid.innerHTML = _cursosCache.map(c => {
                const s = sesMap[c.id];
                if (s) ok++; else no++;
                return `
                <div class="curso-card curso-card--${s?'ok':'no'}" onclick="abrirPanel(${c.id}, '${f}', ${!s})">
                    <div class="curso-card__nombre">${c.grado}° "${c.paralelo}"</div>
                    <div class="curso-card__alumnos">${c.estudiantes_count} est.</div>
                    <div class="curso-card__divider"></div>
                    <span class="status-badge status-badge--${s?'ok':'no'}">${s?'Registrada':'No controlada'}</span>
                    ${s?`<div class="curso-card__by">Por: ${s.registrado_por.nombre}</div>`:''}
                </div>`;
            }).join('');
            
            document.getElementById('countOk').textContent = ok;
            document.getElementById('countNo').textContent = no;
            document.getElementById('resumenStrip').style.display = 'flex';
        }

        async function cargarActividadRegente(f) {
            const grid = document.getElementById('gridActividadRegente');
            const badge = document.getElementById('badgeCorrecciones');
            const { ok, data } = await fetchAPI(`/api/auditoria/actividad/?accion=RESTABLECER_ATRASO&fecha=${f}`);
            const items = ok ? data.results : [];
            const total = ok ? Number(data.total ?? items.length) : 0;
            badge.textContent = total;
            grid.innerHTML = items.length ? items.map(i => `
                <div class="actividad-item">
                    <div class="actividad-icono"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                    <div>
                        <div class="actividad-desc">${i.descripcion}</div>
                        <div class="actividad-meta">${i.usuario_nombre} &middot; ${new Date(i.fecha).toLocaleTimeString()}</div>
                    </div>
                </div>`).join('') : '<div class="grid-loading">Sin correcciones registradas para hoy.</div>';
        }

        async function cargarCitaciones(f) {
            const grid = document.getElementById('gridCitCreadas');
            const badge = document.getElementById('badgeCitTab');
            const res = await fetchAPI(`/api/discipline/citaciones/?fecha_creacion=${f}`);
            const lista = res.ok ? res.data : [];
            badge.textContent = lista.length;
            if (!lista.length) {
                grid.innerHTML = '<div class="cit-diaria-empty">Sin citaciones creadas para esta fecha.</div>';
                return;
            }

            grid.innerHTML = `
                <table class="cit-diaria-table">
                    <thead>
                        <tr>
                            <th>Tipo usuario</th>
                            <th>Nombre emisor</th>
                            <th>Estudiante</th>
                            <th>Curso</th>
                            <th>Límite asistencia</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(c => {
                            const st = CIT_STATUS[c.asistencia || 'PENDIENTE'] || CIT_STATUS.PENDIENTE;
                            return `
                                <tr data-id="${escapeHtml(c.id)}">
                                    <td><span class="cit-diaria-type">${escapeHtml(c.emisor_tipo || 'Sin tipo')}</span></td>
                                    <td>
                                        <div class="cit-diaria-table__main">${escapeHtml(c.emisor_nombre || 'Sin emisor')}</div>
                                        ${c.materia_nombre ? `<div class="cit-diaria-table__muted">${escapeHtml(c.materia_nombre)}</div>` : ''}
                                    </td>
                                    <td>
                                        <div class="cit-diaria-table__main">${escapeHtml(c.estudiante_nombre)}</div>
                                        <div class="cit-diaria-table__muted">${escapeHtml(MOTIVO_LABELS[c.motivo] || c.motivo || 'Sin motivo')}</div>
                                    </td>
                                    <td>${escapeHtml(c.curso)}</td>
                                    <td>${limiteAsistenciaHTML(c)}</td>
                                    <td><span class="estado-badge estado-badge--${st.cls}">${st.label}</span></td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;

            grid.querySelectorAll('tbody tr[data-id]').forEach(row => {
                row.addEventListener('click', () => abrirModalDetalle(row.dataset.id));
            });
        }

        const modalDetalle = document.getElementById('modalDetalleCitacion');
        const modalDetalleContenido = document.getElementById('modalDetalleContenido');
        const btnCerrarDetalle = document.getElementById('btnCerrarDetalle');

        function cerrarModalDetalle() {
            modalDetalle.classList.remove('visible');
        }

        btnCerrarDetalle.addEventListener('click', cerrarModalDetalle);
        modalDetalle.addEventListener('click', e => {
            if (e.target === modalDetalle) cerrarModalDetalle();
        });

        async function abrirModalDetalle(id) {
            modalDetalleContenido.innerHTML = '<div class="grid-loading" style="padding:42px 16px;">Cargando detalle...</div>';
            modalDetalle.classList.add('visible');

            const { ok, data } = await fetchAPI(`/api/discipline/citaciones/${id}/`);
            if (!ok) {
                modalDetalleContenido.innerHTML = '<div class="grid-loading" style="padding:42px 16px;">No se pudo cargar el detalle.</div>';
                return;
            }

            const asistencia = data.asistencia || 'PENDIENTE';
            const st = CIT_STATUS[asistencia] || CIT_STATUS.PENDIENTE;
            const motivo = MOTIVO_LABELS[data.motivo] || data.motivo || 'Sin motivo';
            const estadoEnvio = data.estado === 'VISTO' ? 'Visto' : 'Enviada';
            const puedeMarcar = asistencia === 'PENDIENTE' && typeof window.abrirModalMarcar === 'function';
            const footer = puedeMarcar ? `
                <div class="modal-det__footer" style="padding:0 20px 18px;">
                    <button class="btn-primary" style="width:100%;height:40px;border-radius:var(--radius-sm);font-size:.82rem;" onclick="cerrarModalDetalle();abrirModalMarcar('${escapeHtml(data.id)}','${escapeHtml(data.estudiante_nombre)}')">
                        Marcar asistencia del tutor
                    </button>
                </div>` : '';

            modalDetalleContenido.innerHTML = `
                <div class="modal-det__hero modal-det__hero--${escapeHtml(asistencia)}">
                    <p class="modal-det__nombre">${escapeHtml(data.estudiante_nombre)}</p>
                    <div class="modal-det__sub">
                        <span class="badge-curso">${escapeHtml(data.curso)}</span>
                        <span class="citacion-card__motivo citacion-card__motivo--${escapeHtml(data.motivo)}">${escapeHtml(motivo)}</span>
                        <span class="estado-badge estado-badge--${st.cls}">${escapeHtml(st.label)}</span>
                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(148,163,184,.12);color:var(--text-muted);">${escapeHtml(estadoEnvio)}</span>
                    </div>
                </div>

                <div class="modal-det__body">
                    <div class="modal-det__info-grid">
                        <div class="modal-det__info-item">
                            <p class="modal-det__info-label">Emitido por</p>
                            <p class="modal-det__info-val">${escapeHtml(data.emitido_por_nombre || 'Sin emisor')}</p>
                            <p style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(data.emitido_por_cargo || 'Sin tipo')}</p>
                        </div>
                        <div class="modal-det__info-item">
                            <p class="modal-det__info-label">Tutor registrado</p>
                            <p class="modal-det__info-val">${data.tutor_nombre ? escapeHtml(data.tutor_nombre) : '<em style="color:var(--text-muted);font-weight:400;">Sin tutor</em>'}</p>
                        </div>
                    </div>

                    <div class="modal-det__desc">
                        <p class="modal-det__desc-label">Descripcion</p>
                        <p class="modal-det__desc-text">${escapeHtml(data.motivo_descripcion || 'Sin descripcion')}</p>
                    </div>

                    <div class="modal-det__dates">
                        <div class="modal-det__date-item">
                            <span class="modal-det__date-label">Fecha de envio</span>
                            <span class="modal-det__date-val">${fechaCorta(data.fecha_envio)}</span>
                        </div>
                        <div class="modal-det__date-item">
                            <span class="modal-det__date-label">Fecha limite</span>
                            <span class="modal-det__date-val">${fechaCorta(data.fecha_limite_asistencia)}</span>
                        </div>
                    </div>
                </div>
                ${footer}`;
        }

        async function cargarSinUniforme(f) {
            const grid  = document.getElementById('gridSinUniforme');
            const badge = document.getElementById('badgeSinUniforme');
            const { ok, data } = await fetchAPI(`/api/attendance/sin-uniforme/?fecha=${f}`);
            const lista = ok ? (data.estudiantes || []) : [];
            badge.textContent = ok ? data.total : 0;

            if (!lista.length) {
                grid.innerHTML = '<div class="grid-loading">Sin registro de uniforme para esta fecha.</div>';
                return;
            }

            const estadoLabel = { PRESENTE: 'Presente', ATRASO: 'Atraso' };
            grid.innerHTML = `
                <div class="uniforme-table-wrap">
                    <table class="uniforme-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Estudiante</th>
                                <th>Curso</th>
                                <th>Estado</th>
                                <th>Registrado por</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lista.map((e, i) => `
                                <tr>
                                    <td style="color:var(--text-muted);width:36px">${i + 1}</td>
                                    <td style="font-weight:600"><a href="/director/estudiantes/${e.curso_id}/${e.estudiante_id}/" style="color:var(--accent-text);text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${e.nombre_completo}</a></td>
                                    <td style="color:var(--text-secondary)">${e.curso}</td>
                                    <td><span class="estado-chip estado-chip--${e.estado}">${estadoLabel[e.estado] || e.estado}</span></td>
                                    <td style="color:var(--text-muted)">${e.registrado_por}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
        }

        async function abrirPanel(cursoId, fecha, sinSesion) {
            if (sinSesion) return;
            const res = await fetchAPI(`/api/attendance/cursos/${cursoId}/asistencia/?fecha=${fecha}`);
            if (!res.ok) return;
            const curso = _cursosCache.find(x => x.id == cursoId);
            document.getElementById('panelTitulo').textContent = `${curso.grado}° "${curso.paralelo}"`;
            document.getElementById('panelSubtitulo').textContent = fechaHeroTexto(fecha);
            const cfg = { PRESENTE: 'dot-P', FALTA: 'dot-F', ATRASO: 'dot-A', LICENCIA: 'dot-L' };
            document.getElementById('panelBody').innerHTML = res.data.asistencias.map((a, i) => `
                <div class="est-row">
                    <span class="est-num">${i+1}</span>
                    <div class="est-estado-dot ${cfg[a.estado] || 'dot-P'}"></div>
                    <span class="est-nombre">${a.nombre_completo}</span>
                </div>`).join('');
            document.getElementById('panelOverlay').classList.add('open');
        }

        document.getElementById('panelClose').onclick = () => document.getElementById('panelOverlay').classList.remove('open');

        document.addEventListener('DOMContentLoaded', () => {
            const hoy = hoyBolivia();
            document.getElementById('heroFecha').textContent = fechaHeroTexto(hoy);
            document.getElementById('heroDiaSemana').textContent = diaSemana(hoy);

            function reposicionarDatepicker(instance) {
                if (!instance || !instance.isOpen) return;
                requestAnimationFrame(() => instance._positionCalendar());
            }

            const fp = flatpickr('#inputFecha', {
                locale: 'es', dateFormat: 'Y-m-d', defaultDate: hoy, maxDate: hoy,
                position: 'auto right',
                onReady: (_, __, instance) => reposicionarDatepicker(instance),
                onOpen: (_, __, instance) => reposicionarDatepicker(instance),
                onChange: (ds, dateStr) => {
                    document.getElementById('heroFecha').textContent = fechaHeroTexto(dateStr);
                    document.getElementById('heroDiaSemana').textContent = diaSemana(dateStr);
                    cargarTodo();
                }
            });

            window.addEventListener('resize', () => reposicionarDatepicker(fp));
            document.querySelector('.main-content')?.addEventListener('scroll', () => reposicionarDatepicker(fp));
            cargarTodo();
        });
