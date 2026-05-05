(function () {
        const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        let _userId = null;

        // ── Sidebar ──────────────────────────────────────────────
        const userLocal = JSON.parse(localStorage.getItem('user') || 'null');
        if (userLocal) {
            const n = [userLocal.first_name, userLocal.last_name].filter(Boolean).join(' ') || userLocal.username;
            document.getElementById('profileName').textContent = "Republica de Francia 'A'";
        }
        document.getElementById('btnLogout').addEventListener('click', () => {
            localStorage.clear(); window.location.replace('/login/');
        });

        // ── Helpers ──────────────────────────────────────────────
        function toast(msg, tipo = 'success') {
            const el = document.getElementById('toast');
            el.textContent = msg;
            el.className = `toast toast--${tipo} visible`;
            clearTimeout(el._t);
            el._t = setTimeout(() => el.classList.remove('visible'), 3200);
        }
        function fmt(iso) {
            if (!iso) return '—';
            const d = new Date(iso);
            return `${String(d.getDate()).padStart(2,'0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
        }
        function fmtHora(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }
        function setErr(inputId, errId, msg) {
            document.getElementById(inputId).classList.toggle('error', !!msg);
            const e = document.getElementById(errId);
            e.style.display = msg ? 'block' : 'none';
            e.textContent   = msg || '';
        }
        function clearErrs(...pairs) { pairs.forEach(([i,e]) => setErr(i, e, '')); }

        function accionClass(accion) {
            if (!accion) return 'accion--default';
            const a = accion.toUpperCase();
            if (a === 'LOGIN')                       return 'accion--login';
            if (a.startsWith('CREAR'))               return 'accion--crear';
            if (a.startsWith('EDITAR'))              return 'accion--editar';
            if (a.startsWith('RESET'))               return 'accion--reset';
            if (a.includes('PASSWORD') || a.includes('CREDENCIAL')) return 'accion--password';
            return 'accion--default';
        }
        function accionLabel(accion) {
            const MAP = {
                LOGIN: 'Login', CREAR_USUARIO: 'Creó usuario', EDITAR_USUARIO: 'Editó usuario',
                RESET_PASSWORD: 'Reseteo contraseña', CAMBIO_PASSWORD: 'Cambió contraseña',
                CREAR_CITACION: 'Creó citación', ACTUALIZAR_CITACION: 'Actualizó citación',
            };
            return MAP[accion] || accion;
        }

        // ── Cargar perfil ─────────────────────────────────────────
        async function cargarPerfil() {
            const res = await fetchAPI('/api/users/mi-perfil/');
            if (!res.ok) return;
            const d = res.data;
            _userId = d.id;

            const nombre    = [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username;
            const iniciales = [d.first_name?.[0], d.last_name?.[0]].filter(Boolean).join('').toUpperCase()
                            || d.username[0].toUpperCase();

            document.getElementById('avatarInicial').textContent   = iniciales;
            document.getElementById('perfilNombre').textContent    = nombre;
            document.getElementById('perfilNombreRow').textContent = nombre;
            document.getElementById('perfilUsername').textContent  = `@${d.username}`;
            document.getElementById('perfilUser').textContent      = d.username;
            document.getElementById('perfilDesde').textContent     = fmt(d.date_joined);
            document.getElementById('perfilUltimoAcceso').textContent = d.last_login
                ? `${fmt(d.last_login)} · ${fmtHora(d.last_login)}` : '—';

            document.getElementById('inputNombre').value    = d.first_name || '';
            document.getElementById('inputApellidos').value = d.last_name  || '';
        }

        // ── Panel nombre ──────────────────────────────────────────
        const panelNombre = document.getElementById('panelEditNombre');
        document.getElementById('btnEditNombre').addEventListener('click', () => {
            panelNombre.classList.toggle('open');
            if (panelNombre.classList.contains('open')) document.getElementById('inputNombre').focus();
        });
        document.getElementById('btnCancelarNombre').addEventListener('click', () => {
            panelNombre.classList.remove('open');
            clearErrs(['inputNombre','errNombre'], ['inputApellidos','errApellidos']);
        });
        document.getElementById('btnGuardarNombre').addEventListener('click', async () => {
            const btn        = document.getElementById('btnGuardarNombre');
            const first_name = document.getElementById('inputNombre').value.trim();
            const last_name  = document.getElementById('inputApellidos').value.trim();

            clearErrs(['inputNombre','errNombre'], ['inputApellidos','errApellidos']);
            if (!first_name) { setErr('inputNombre',    'errNombre',    'Obligatorio.'); return; }
            if (!last_name)  { setErr('inputApellidos', 'errApellidos', 'Obligatorio.'); return; }

            btn.disabled = true;
            const res = await fetchAPI('/api/users/mi-perfil/', 'PATCH', { first_name, last_name });
            btn.disabled = false;

            if (res.ok) {
                const nombre = `${res.data.first_name} ${res.data.last_name}`.trim();
                document.getElementById('perfilNombre').textContent    = nombre;
                document.getElementById('perfilNombreRow').textContent = nombre;
                document.getElementById('profileName').textContent     = "Republica de Francia 'A'";
                document.getElementById('avatarInicial').textContent   =
                    [res.data.first_name?.[0], res.data.last_name?.[0]].filter(Boolean).join('').toUpperCase();
                const u = JSON.parse(localStorage.getItem('user') || '{}');
                u.first_name = res.data.first_name; u.last_name = res.data.last_name;
                localStorage.setItem('user', JSON.stringify(u));
                panelNombre.classList.remove('open');
                toast('Nombre actualizado.');
            } else {
                if (res.data?.first_name) setErr('inputNombre',    'errNombre',    res.data.first_name[0]);
                if (res.data?.last_name)  setErr('inputApellidos', 'errApellidos', res.data.last_name[0]);
                if (res.data?.errores)    toast(res.data.errores, 'error');
            }
        });

        // ── Modales de contraseña ─────────────────────────────────
        const modalPass        = document.getElementById('modalPass');
        const modalConfirmPass = document.getElementById('modalConfirmPass');

        function cerrarModalPass() {
            modalPass.classList.remove('visible');
            passInputs.forEach(inp => { inp.value = ''; });
            clearErrs(['inputPassActual','errPassActual'], ['inputPassNueva','errPassNueva'], ['inputPassConfirm','errPassConfirm']);
            btnSiguiente.disabled = true;
        }

        // Habilitar "Continuar" solo cuando los 3 campos tienen contenido real
        const btnSiguiente = document.getElementById('btnSiguientePass');
        const passInputs   = ['inputPassActual','inputPassNueva','inputPassConfirm'].map(id => document.getElementById(id));

        function verificarCamposPass() {
            const llenos = passInputs.every(inp => inp.value.trim().length > 0);
            btnSiguiente.disabled = !llenos;
        }
        passInputs.forEach(inp => inp.addEventListener('input', verificarCamposPass));
        btnSiguiente.disabled = true; // deshabilitado por defecto

        document.getElementById('btnAbrirModalPass').addEventListener('click', () => {
            modalPass.classList.add('visible');
            document.getElementById('inputPassActual').focus();
        });

        document.getElementById('btnCancelarPass').addEventListener('click', cerrarModalPass);

        // Cerrar al clicar el fondo
        modalPass.addEventListener('click', e => { if (e.target === modalPass) cerrarModalPass(); });

        // Validar y pasar a confirmación
        document.getElementById('btnSiguientePass').addEventListener('click', () => {
            const password_actual = document.getElementById('inputPassActual').value;
            const password_nueva  = document.getElementById('inputPassNueva').value;
            const confirm         = document.getElementById('inputPassConfirm').value;

            clearErrs(['inputPassActual','errPassActual'], ['inputPassNueva','errPassNueva'], ['inputPassConfirm','errPassConfirm']);
            let ok = true;
            if (!password_actual) { setErr('inputPassActual', 'errPassActual', 'Obligatorio.'); ok = false; }
            if (!password_nueva)  { setErr('inputPassNueva',  'errPassNueva',  'Obligatorio.'); ok = false; }
            else if (password_nueva.length < 8 || password_nueva.length > 20) {
                setErr('inputPassNueva', 'errPassNueva', 'Entre 8 y 20 caracteres.'); ok = false;
            }
            if (password_nueva && confirm !== password_nueva) {
                setErr('inputPassConfirm', 'errPassConfirm', 'No coinciden.'); ok = false;
            }
            if (!ok) return;

            // Pasa validación → mostrar confirmación
            modalPass.classList.remove('visible');
            modalConfirmPass.classList.add('visible');
        });

        // Volver al formulario
        document.getElementById('btnVolverPass').addEventListener('click', () => {
            modalConfirmPass.classList.remove('visible');
            modalPass.classList.add('visible');
        });

        // Confirmar y enviar
        document.getElementById('btnConfirmarPass').addEventListener('click', async () => {
            const btn             = document.getElementById('btnConfirmarPass');
            const password_actual = document.getElementById('inputPassActual').value;
            const password_nueva  = document.getElementById('inputPassNueva').value;

            btn.disabled = true;
            const res = await fetchAPI('/api/users/mi-perfil/', 'POST', { password_actual, password_nueva });
            btn.disabled = false;

            if (res.ok) {
                modalConfirmPass.classList.remove('visible');
                toast('Contraseña actualizada. Redirigiendo...');
                setTimeout(() => { localStorage.clear(); window.location.replace('/login/'); }, 2200);
            } else {
                // Error (ej: contraseña actual incorrecta) → volver al formulario con el error
                modalConfirmPass.classList.remove('visible');
                modalPass.classList.add('visible');
                if (res.data?.errores) setErr('inputPassActual', 'errPassActual', res.data.errores);
            }
        });

        // ── Últimos accesos ───────────────────────────────────────
        async function cargarAccesos() {
            if (!_userId) return;
            const res   = await fetchAPI(`/api/auditoria/actividad/?accion=LOGIN&usuario_id=${_userId}&page=1`);
            const lista = document.getElementById('accesosLista');
            if (!res.ok || !res.data.results?.length) {
                lista.innerHTML = '<div class="empty-state">Sin registros.</div>'; return;
            }
            lista.innerHTML = res.data.results.slice(0, 8).map(r => `
                <div class="acceso-item">
                    <span class="acceso-dot"></span>
                    <span class="acceso-fecha">${fmt(r.fecha)}</span>
                    <span class="acceso-hora">${fmtHora(r.fecha)}</span>
                    <span class="acceso-ip">${r.ip || '—'}</span>
                </div>
            `).join('');
        }

        // ── Actividad reciente ────────────────────────────────────
        async function cargarActividad() {
            if (!_userId) return;
            const res   = await fetchAPI(`/api/auditoria/actividad/?usuario_id=${_userId}&page=1`);
            const lista = document.getElementById('actividadLista');
            if (!res.ok || !res.data.results?.length) {
                lista.innerHTML = '<div class="empty-state">Sin actividad registrada.</div>'; return;
            }
            lista.innerHTML = res.data.results.slice(0, 12).map(r => `
                <div class="actividad-item">
                    <span class="accion-badge ${accionClass(r.accion)}">${accionLabel(r.accion)}</span>
                    <span class="actividad-desc">${r.descripcion}</span>
                    <span class="actividad-fecha">${fmt(r.fecha)}&nbsp;${fmtHora(r.fecha)}</span>
                </div>
            `).join('');
        }

        // ── Sugerencias ───────────────────────────────────────────
        const modalSug      = document.getElementById('modalSugerencia');
        const inputSug      = document.getElementById('inputSugerencia');
        const contadorSug   = document.getElementById('contadorSugerencia');
        const errSug        = document.getElementById('errSugerencia');
        const exitoSug      = document.getElementById('sugerenciaExito');
        const btnEnviarSug  = document.getElementById('btnEnviarSugerencia');

        document.getElementById('btnAbrirSugerencias').addEventListener('click', () => {
            inputSug.value = '';
            contadorSug.textContent = '0/1000';
            errSug.style.display = 'none';
            exitoSug.style.display = 'none';
            btnEnviarSug.disabled = false;
            btnEnviarSug.textContent = 'Enviar';
            modalSug.classList.add('visible');
            inputSug.focus();
        });

        document.getElementById('btnCancelarSugerencia').addEventListener('click', () => {
            modalSug.classList.remove('visible');
        });

        modalSug.addEventListener('click', e => {
            if (e.target === modalSug) modalSug.classList.remove('visible');
        });

        inputSug.addEventListener('input', () => {
            contadorSug.textContent = `${inputSug.value.length}/1000`;
            errSug.style.display = 'none';
        });

        btnEnviarSug.addEventListener('click', async () => {
            const msg = inputSug.value.trim();
            if (!msg) {
                errSug.textContent = 'El mensaje no puede estar vacío.';
                errSug.style.display = 'block';
                return;
            }
            btnEnviarSug.disabled = true;
            btnEnviarSug.textContent = 'Enviando…';
            const res = await fetchAPI('/api/auth/sugerencias/', {
                method: 'POST',
                body: JSON.stringify({ mensaje: msg }),
            });
            if (res.ok || res.status === 204) {
                exitoSug.style.display = 'block';
                btnEnviarSug.style.display = 'none';
                document.getElementById('btnCancelarSugerencia').textContent = 'Cerrar';
            } else {
                errSug.textContent = res.data?.errores || 'No se pudo enviar. Intenta más tarde.';
                errSug.style.display = 'block';
                btnEnviarSug.disabled = false;
                btnEnviarSug.textContent = 'Enviar';
            }
        });

        // ── Init ─────────────────────────────────────────────────
        cargarPerfil().then(() => {
            cargarAccesos();
            cargarActividad();
        });

    })();
