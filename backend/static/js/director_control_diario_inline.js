const MOTIVO_LABELS = {
            FALTAS: 'Faltas',
            ATRASOS: 'Atrasos',
            CONDUCTA: 'Conducta',
            RENDIMIENTO: 'Rendimiento',
            REUNION: 'Reunion',
            DOCUMENTOS: 'Documentos',
            COMPORTAMIENTO: 'Comportamiento',
            BAJO_RENDIMIENTO: 'Bajo rendimiento',
            OTRO: 'Otro'
        };
        const CIT_STATUS = {
            PENDIENTE: { label: 'Pendiente', cls: 'pendiente' },
            ASISTIO: { label: 'Asistio', cls: 'asistio' },
            NO_ASISTIO: { label: 'No asistio', cls: 'no_asistio' },
            ATRASO: { label: 'Atraso', cls: 'atraso' },
            ANULADA: { label: 'Anulada', cls: 'anulada' }
        };
        function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
        function fechaCorta(f) {
            if (!f) return 'Sin fecha';
            const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
            return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
        }
        function parseFechaLocal(f) {
            if (!f) return null;
            const parts = String(f).slice(0, 10).split('-').map(Number);
            if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }
        function inicioHoy() {
            const d = new Date();
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
        function claseLimiteAsistencia(c) {
            const limite = parseFechaLocal(c.fecha_limite_asistencia);
            if (!limite) return 'neutral';
            const hoy = inicioHoy();
            if (limite <= hoy) return 'danger';
            const creada = parseFechaLocal(c.fecha_creacion || c.fecha_envio) || hoy;
            const total = limite - creada;
            if (total <= 0) return 'danger';
            const transcurrido = hoy - creada;
            if (transcurrido <= 0) return 'ok';
            return (transcurrido / total) >= 0.5 ? 'warn' : 'ok';
        }
        function limiteAsistenciaHTML(c) {
            const cls = claseLimiteAsistencia(c);
            return `<span class="cit-limit cit-limit--${cls}">${escapeHtml(fechaCorta(c.fecha_limite_asistencia))}</span>`;
        }
        const token = localStorage.getItem('access_token');
        const user  = JSON.parse(localStorage.getItem('user') || 'null');
        if (!token || !user || !['Director', 'Regente'].includes(user.tipo_usuario)) {
            window.location.replace('/login/');
        }
