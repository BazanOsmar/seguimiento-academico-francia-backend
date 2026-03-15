'use strict';

const USER_ID = parseInt(document.getElementById('perfilRoot').dataset.userId, 10);

// ── DOM refs ──────────────────────────────────────────────────────
const perfilNombre        = document.getElementById('perfilNombre');
const perfilUsername      = document.getElementById('perfilUsername');
const perfilRol           = document.getElementById('perfilRol');
const perfilLastLogin     = document.getElementById('perfilLastLogin');
const perfilIniciales     = document.getElementById('perfilIniciales');
const perfilFcm           = document.getElementById('perfilFcm');
const bannerPrimerIngreso = document.getElementById('bannerPrimerIngreso');
const estudianteSection   = document.getElementById('estudianteSection');
const estudiantesLista    = document.getElementById('estudiantesLista');
const citacionesSection   = document.getElementById('citacionesSection');
const citacionesTbody     = document.getElementById('citacionesTbody');
const cursosSection       = document.getElementById('cursosSection');
const cursosChips         = document.getElementById('cursosChips');

// Editar nombre
const btnEditarNombre     = document.getElementById('btnEditarNombre');
const editNombreForm      = document.getElementById('editNombreForm');
const editNombre          = document.getElementById('editNombre');
const editApellidos       = document.getElementById('editApellidos');
const editNombreErr       = document.getElementById('editNombreErr');
const editApellidosErr    = document.getElementById('editApellidosErr');
const btnEditarCancelar   = document.getElementById('btnEditarCancelar');
const btnEditarGuardar    = document.getElementById('btnEditarGuardar');
const editGuardarTexto    = document.getElementById('editGuardarTexto');
const editGuardarSpinner  = document.getElementById('editGuardarSpinner');

const btnReset         = document.getElementById('btnResetPassword');

const modalConfirm     = document.getElementById('modalConfirm');
const btnConfirmSi     = document.getElementById('btnConfirmSi');
const btnConfirmNo     = document.getElementById('btnConfirmNo');
const confirmSpinner   = document.getElementById('confirmSpinner');
const confirmText      = document.getElementById('confirmText');

const modalCred        = document.getElementById('modalCred');
const credNombre       = document.getElementById('credNombre');
const credUser         = document.getElementById('credUser');
const credPass         = document.getElementById('credPass');
const btnCredOk        = document.getElementById('btnCredOk');

// ── Helpers ───────────────────────────────────────────────────────
const BADGE = {
    'Profesor': { cls: 'badge--docente',  label: 'Docente'  },
    'Tutor':    { cls: 'badge--padre',    label: 'Padre'    },
    'Regente':  { cls: 'badge--regente',  label: 'Regente'  },
    'Director': { cls: 'badge--director', label: 'Director' },
};

function badgeHtml(rol) {
    const b = BADGE[rol] || { cls: 'badge--default', label: rol || '—' };
    return `<span class="role-badge ${b.cls}">${b.label}</span>`;
}

function formatLastLogin(dt) {
    if (!dt) return '<span class="no-data">Nunca entró</span>';
    const d        = new Date(dt);
    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dDate    = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - dDate) / 86400000);
    const hh   = d.getHours().toString().padStart(2, '0');
    const mm   = d.getMinutes().toString().padStart(2, '0');
    const time = `${hh}:${mm}`;
    if (diffDays === 0) return `Hoy, ${time}`;
    if (diffDays === 1) return `Ayer, ${time}`;
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

// ── Estado badge (citaciones) ─────────────────────────────────────
const ESTADO_MAP = {
    'PENDIENTE':   { cls: 'estado--pendiente',   label: 'Pendiente'   },
    'VISTO':       { cls: 'estado--visto',        label: 'Visto'       },
    'ASISTIO':     { cls: 'estado--asistio',      label: 'Asistió'     },
    'NO_ASISTIO':  { cls: 'estado--no_asistio',   label: 'No asistió'  },
    'ATRASO':      { cls: 'estado--atraso',       label: 'Atraso'      },
    'Informativo': { cls: 'estado--informativo',  label: 'Informativo' },
};
function estadoBadgeHtml(estado) {
    const b = ESTADO_MAP[estado] || { cls: '', label: estado };
    return `<span class="estado-badge ${b.cls}">${b.label}</span>`;
}

// ── FCM badge ─────────────────────────────────────────────────────
function fcmBadgeHtml(tieneFcm) {
    if (tieneFcm) {
        return `<span class="fcm-badge fcm-badge--activo">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            Con app
        </span>`;
    }
    return `<span class="fcm-badge fcm-badge--sin">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        Sin app
    </span>`;
}

// ── Cargar datos del usuario ──────────────────────────────────────
let _cachedData = null;

(async () => {
    const { ok, data } = await fetchAPI(`/api/users/${USER_ID}/`);
    if (!ok) {
        perfilNombre.textContent = 'Usuario no encontrado';
        btnReset.disabled = true;
        return;
    }
    _cachedData = data;

    const nombre = `${data.first_name} ${data.last_name}`.trim();
    perfilNombre.textContent    = nombre || data.username;
    perfilUsername.textContent  = `@${data.username}`;
    perfilRol.innerHTML         = badgeHtml(data.rol);
    perfilLastLogin.innerHTML   = formatLastLogin(data.last_login);
    perfilIniciales.textContent = (
        (data.first_name?.[0] || '') + (data.last_name?.[0] || '')
    ).toUpperCase() || data.username[0].toUpperCase();

    // Mostrar botón de editar ahora que los datos cargaron
    btnEditarNombre.classList.remove('hidden');

    // FCM
    perfilFcm.innerHTML = fcmBadgeHtml(data.tiene_fcm);

    // Primer ingreso
    if (data.primer_ingreso) {
        bannerPrimerIngreso.classList.remove('hidden');
    }

    // Estudiantes vinculados (solo Tutores)
    if (data.estudiantes && data.estudiantes.length > 0) {
        estudianteSection.classList.remove('hidden');
        estudiantesLista.innerHTML = data.estudiantes.map(e => {
            const iniciales = (
                (e.nombre?.[0] || '') + (e.apellido_paterno?.[0] || '')
            ).toUpperCase();
            const curso  = `${e.curso__grado} ${e.curso__paralelo}`;
            const identificador = e.identificador ? `ID: ${e.identificador}` : 'Sin identificador';
            return `
                <a class="estudiante-card"
                   href="/director/estudiantes/${e.curso__id}/?highlight=${e.id}">
                    <div class="estudiante-avatar">${iniciales}</div>
                    <div class="estudiante-info">
                        <div class="estudiante-nombre">${(e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}</div>
                        <div class="estudiante-meta">${curso} &middot; ${identificador}</div>
                    </div>
                    <svg class="estudiante-arrow" width="16" height="16" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </a>`;
        }).join('');
    }

    // Citaciones recientes (solo Tutores)
    if (data.citaciones_recientes && data.citaciones_recientes.length > 0) {
        citacionesSection.classList.remove('hidden');
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        citacionesTbody.innerHTML = data.citaciones_recientes.map(c => {
            const est  = `${(c.estudiante__apellido_paterno + ' ' + c.estudiante__apellido_materno).trim()}, ${c.estudiante__nombre}`;
            const fLim = c.fecha_limite_asistencia
                ? (() => { const d = new Date(c.fecha_limite_asistencia + 'T00:00:00');
                           return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; })()
                : '—';
            return `<tr>
                <td>${est}</td>
                <td style="color:var(--text-secondary)">${c.motivo}</td>
                <td>${estadoBadgeHtml(c.asistencia)}</td>
                <td style="color:var(--text-muted);font-size:.8rem">${fLim}</td>
            </tr>`;
        }).join('');
    }

    // Cursos asignados (solo Profesores)
    if (data.cursos && data.cursos.length > 0) {
        cursosSection.classList.remove('hidden');
        cursosChips.innerHTML = data.cursos.map(c =>
            `<span class="curso-chip">
                <span class="curso-chip-grado">${c.curso__grado} ${c.curso__paralelo}</span>
                <span style="color:var(--border)">·</span>
                ${c.materia__nombre}
            </span>`
        ).join('');
    }

    // Planes de Trabajo (solo Profesores)
    if (data.rol === 'Profesor') {
        const planesSection = document.getElementById('planesSection');
        const mesSel        = document.getElementById('perfilPlanesMes');
        planesSection.classList.remove('hidden');
        mesSel.value = String(new Date().getMonth() + 1);
        await _cargarPerfilPlanes(USER_ID, mesSel.value);
        mesSel.addEventListener('change', () => _cargarPerfilPlanes(USER_ID, mesSel.value));
    }
})();

// ── Editar nombre/apellido ────────────────────────────────────────
btnEditarNombre.addEventListener('click', () => {
    editNombre.value    = _cachedData?.first_name || '';
    editApellidos.value = _cachedData?.last_name  || '';
    editNombreErr.classList.add('hidden');
    editApellidosErr.classList.add('hidden');
    editNombre.classList.remove('input-error');
    editApellidos.classList.remove('input-error');
    editNombreForm.classList.remove('hidden');
    btnEditarNombre.classList.add('hidden');
    editNombre.focus();
});

btnEditarCancelar.addEventListener('click', () => {
    editNombreForm.classList.add('hidden');
    btnEditarNombre.classList.remove('hidden');
});

btnEditarGuardar.addEventListener('click', async () => {
    const fn = editNombre.value.trim();
    const ln = editApellidos.value.trim();

    editNombreErr.classList.add('hidden');
    editApellidosErr.classList.add('hidden');
    editNombre.classList.remove('input-error');
    editApellidos.classList.remove('input-error');

    let valido = true;
    if (!fn) {
        editNombreErr.textContent = 'Campo obligatorio.';
        editNombreErr.classList.remove('hidden');
        editNombre.classList.add('input-error');
        valido = false;
    }
    if (!ln) {
        editApellidosErr.textContent = 'Campo obligatorio.';
        editApellidosErr.classList.remove('hidden');
        editApellidos.classList.add('input-error');
        valido = false;
    }
    if (!valido) return;

    editGuardarTexto.classList.add('hidden');
    editGuardarSpinner.classList.remove('hidden');
    btnEditarGuardar.disabled = true;
    btnEditarCancelar.disabled = true;

    const { ok, data } = await fetchAPI(`/api/users/${USER_ID}/`, {
        method: 'PATCH',
        body: JSON.stringify({ first_name: fn, last_name: ln }),
    });

    editGuardarTexto.classList.remove('hidden');
    editGuardarSpinner.classList.add('hidden');
    btnEditarGuardar.disabled = false;
    btnEditarCancelar.disabled = false;

    if (!ok) {
        if (data?.first_name) {
            editNombreErr.textContent = data.first_name[0];
            editNombreErr.classList.remove('hidden');
            editNombre.classList.add('input-error');
        }
        if (data?.last_name) {
            editApellidosErr.textContent = data.last_name[0];
            editApellidosErr.classList.remove('hidden');
            editApellidos.classList.add('input-error');
        }
        return;
    }

    // Actualizar display
    const nombre = `${data.first_name} ${data.last_name}`.trim();
    perfilNombre.textContent    = nombre;
    perfilIniciales.textContent = (
        (data.first_name?.[0] || '') + (data.last_name?.[0] || '')
    ).toUpperCase();
    if (_cachedData) {
        _cachedData.first_name = data.first_name;
        _cachedData.last_name  = data.last_name;
    }
    editNombreForm.classList.add('hidden');
    btnEditarNombre.classList.remove('hidden');
});

// ── Resetear contraseña ───────────────────────────────────────────
btnReset.addEventListener('click', () => {
    modalConfirm.classList.add('visible');
});

btnConfirmNo.addEventListener('click', () => {
    modalConfirm.classList.remove('visible');
});

btnConfirmSi.addEventListener('click', async () => {
    btnConfirmSi.disabled = true;
    btnConfirmNo.disabled = true;
    confirmText.classList.add('hidden');
    confirmSpinner.classList.remove('hidden');

    const { ok, data } = await fetchAPI('/api/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ user_id: USER_ID }),
    });

    btnConfirmSi.disabled = false;
    btnConfirmNo.disabled = false;
    confirmText.classList.remove('hidden');
    confirmSpinner.classList.add('hidden');
    modalConfirm.classList.remove('visible');

    if (!ok) return;

    credNombre.textContent = perfilNombre.textContent;
    credUser.textContent   = perfilUsername.textContent.replace('@', '');
    credPass.textContent   = data.password_nueva;
    modalCred.classList.add('visible');
});

btnCredOk.addEventListener('click', () => {
    modalCred.classList.remove('visible');
});

// ── Planes de Trabajo (solo Profesores) ──────────────────────────
let _perfilPlanesData = [];

async function _cargarPerfilPlanes(profesorId, mes) {
    const grid = document.getElementById('perfilPlanesGrid');
    grid.innerHTML = '<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-muted);font-size:.82rem;">Cargando…</div>';

    const { ok, data } = await fetchAPI(`/api/academics/director/planes/?mes=${mes}&profesor_id=${profesorId}`);
    _perfilPlanesData = ok ? (data || []) : [];

    const semanas = { 1: null, 2: null, 3: null, 4: null };
    for (const p of _perfilPlanesData) {
        if (semanas[p.semana] === null) semanas[p.semana] = p;
    }

    grid.innerHTML = [1, 2, 3, 4].map(s => {
        const plan = semanas[s];
        return `
            <div class="plan-slot-sm">
                <div class="plan-slot-sm-label">Sem ${s}</div>
                ${plan
                    ? `<div class="plan-chip-sm" data-plan-id="${plan.id}">${_escPerf(plan.descripcion.substring(0, 60))}${plan.descripcion.length > 60 ? '…' : ''}</div>`
                    : `<div class="plan-slot-sm-empty">—</div>`
                }
            </div>`;
    }).join('');

    grid.querySelectorAll('.plan-chip-sm').forEach(chip => {
        chip.addEventListener('click', () => {
            const plan = _perfilPlanesData.find(p => p.id === Number(chip.dataset.planId));
            if (!plan) return;
            const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            document.getElementById('planDetTitle').textContent = `Semana ${plan.semana}`;
            document.getElementById('planDetSub').textContent   = meses[plan.mes] || '';
            document.getElementById('planDetBody').textContent  = plan.descripcion;
            document.getElementById('planDetDates').textContent = `${plan.fecha_inicio} al ${plan.fecha_fin}`;
            document.getElementById('planDetOverlay').classList.add('visible');
        });
    });
}

function _escPerf(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('btnClosePlanDet').addEventListener('click', () => {
    document.getElementById('planDetOverlay').classList.remove('visible');
});
document.getElementById('planDetOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('planDetOverlay'))
        document.getElementById('planDetOverlay').classList.remove('visible');
});

// ── Copiar credenciales ───────────────────────────────────────────
document.querySelectorAll('.cred-copy').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = document.getElementById(btn.dataset.target).textContent;
        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        });
    });
});
