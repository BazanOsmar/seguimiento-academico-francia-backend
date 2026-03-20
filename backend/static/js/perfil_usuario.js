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
const cursosSection                = document.getElementById('cursosSection');
const cursosChips                  = document.getElementById('cursosChips');
const citacionesEmitidasSection    = document.getElementById('citacionesEmitidasSection');
const citacionesEmitidasTbody      = document.getElementById('citacionesEmitidasTbody');


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
            const activoBadge = e.activo
                ? `<span style="font-size:.7rem;padding:2px 7px;border-radius:20px;background:rgba(34,197,94,.12);color:#22c55e;font-weight:600;">Activo</span>`
                : `<span style="font-size:.7rem;padding:2px 7px;border-radius:20px;background:rgba(239,68,68,.12);color:#ef4444;font-weight:600;">Baja</span>`;
            return `
                <a class="estudiante-card"
                   href="/director/estudiantes/${e.curso__id}/?highlight=${e.id}">
                    <div class="estudiante-avatar">${iniciales}</div>
                    <div class="estudiante-info">
                        <div class="estudiante-nombre" style="display:flex;align-items:center;gap:8px;">
                            <span>${(e.apellido_paterno + ' ' + e.apellido_materno).trim()}, ${e.nombre}</span>
                            ${activoBadge}
                        </div>
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

    // Citaciones emitidas (solo Regentes)
    if (data.citaciones_emitidas && data.citaciones_emitidas.length > 0) {
        citacionesEmitidasSection.classList.remove('hidden');
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        citacionesEmitidasTbody.innerHTML = data.citaciones_emitidas.map(c => {
            const est = `${(c.estudiante__apellido_paterno + ' ' + c.estudiante__apellido_materno).trim()}, ${c.estudiante__nombre}`;
            const fEnv = c.fecha_envio
                ? (() => { const d = new Date(c.fecha_envio);
                           return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; })()
                : '—';
            return `<tr>
                <td>${est}</td>
                <td style="color:var(--text-secondary)">${c.motivo}</td>
                <td>${estadoBadgeHtml(c.asistencia)}</td>
                <td style="color:var(--text-muted);font-size:.8rem">${fEnv}</td>
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

// ── Resetear contraseña ───────────────────────────────────────────
const confirmResetPassword    = document.getElementById('confirmResetPassword');
const confirmResetPasswordErr = document.getElementById('confirmResetPasswordErr');

function _cerrarModalConfirm() {
    modalConfirm.classList.remove('visible');
    confirmResetPassword.value = '';
    confirmResetPasswordErr.classList.add('hidden');
    confirmResetPassword.classList.remove('input-error');
}

btnReset.addEventListener('click', () => {
    confirmResetPassword.value = '';
    confirmResetPasswordErr.classList.add('hidden');
    confirmResetPassword.classList.remove('input-error');
    modalConfirm.classList.add('visible');
    setTimeout(() => confirmResetPassword.focus(), 50);
});

btnConfirmNo.addEventListener('click', _cerrarModalConfirm);

btnConfirmSi.addEventListener('click', async () => {
    const pwd = confirmResetPassword.value.trim();
    if (!pwd) {
        confirmResetPasswordErr.textContent = 'Ingresa tu contraseña.';
        confirmResetPasswordErr.classList.remove('hidden');
        confirmResetPassword.classList.add('input-error');
        confirmResetPassword.focus();
        return;
    }

    btnConfirmSi.disabled = true;
    btnConfirmNo.disabled = true;
    confirmText.classList.add('hidden');
    confirmSpinner.classList.remove('hidden');

    const { ok, status, data } = await fetchAPI('/api/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ user_id: USER_ID, password_director: pwd }),
    });

    btnConfirmSi.disabled = false;
    btnConfirmNo.disabled = false;
    confirmText.classList.remove('hidden');
    confirmSpinner.classList.add('hidden');

    if (!ok) {
        if (status === 403) {
            confirmResetPasswordErr.textContent = 'Contraseña incorrecta.';
            confirmResetPasswordErr.classList.remove('hidden');
            confirmResetPassword.classList.add('input-error');
            confirmResetPassword.focus();
        }
        return;
    }

    _cerrarModalConfirm();
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
