'use strict';

let _page   = 1;
let _accion = '';
let _pages  = 1;

// ── DOM refs ──────────────────────────────────────────────────────
const tbody      = document.getElementById('tbodyActividad');
const tableCount = document.getElementById('tableCount');
const btnPrev    = document.getElementById('btnPrev');
const btnNext    = document.getElementById('btnNext');
const pageInfo   = document.getElementById('pageInfo');

// ── Meta de acciones (label + color) ─────────────────────────────
const ACCION_META = {
    'LOGIN':                { label: 'Login',            cls: 'badge-login'      },
    'CREAR_USUARIO':        { label: 'Crear usuario',    cls: 'badge-usuario'    },
    'RESET_PASSWORD':       { label: 'Reset contraseña', cls: 'badge-reset'      },
    'REGISTRAR_ASISTENCIA': { label: 'Asistencia',       cls: 'badge-asistencia' },
    'CREAR_CITACION':       { label: 'Citación',         cls: 'badge-citacion'   },
    'ACTUALIZAR_CITACION':  { label: 'Act. citación',    cls: 'badge-citacion'   },
};

function badgeAccion(accion) {
    const m = ACCION_META[accion] || { label: accion, cls: 'badge-default' };
    return `<span class="accion-badge ${m.cls}">${m.label}</span>`;
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatFecha(dt) {
    if (!dt) return '—';
    const d      = new Date(dt);
    const now    = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dDate  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff   = Math.round((today - dDate) / 86400000);
    const hh     = d.getHours().toString().padStart(2, '0');
    const mm     = d.getMinutes().toString().padStart(2, '0');
    const time   = `${hh}:${mm}`;
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    if (diff === 0) return `Hoy, ${time}`;
    if (diff === 1) return `Ayer, ${time}`;
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

// ── Render ────────────────────────────────────────────────────────
function renderTabla(registros) {
    if (!registros.length) {
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="4">No hay registros.</td></tr>`;
        tableCount.textContent = '0 registros';
        return;
    }
    tbody.innerHTML = registros.map(r => `
        <tr>
            <td style="white-space:nowrap;">${badgeAccion(r.accion)}</td>
            <td class="td-descripcion">${escHtml(r.descripcion)}</td>
            <td class="td-muted" style="white-space:nowrap;">${escHtml(r.usuario_nombre)}</td>
            <td class="td-muted" style="white-space:nowrap;">${formatFecha(r.fecha)}</td>
        </tr>
    `).join('');
}

function renderPaginacion(page, pages, total) {
    tableCount.textContent = `${total} ${total === 1 ? 'registro' : 'registros'}`;
    pageInfo.textContent   = `Página ${page} de ${pages}`;
    btnPrev.disabled = page <= 1;
    btnNext.disabled = page >= pages;
}

// ── Carga ─────────────────────────────────────────────────────────
async function cargar() {
    tbody.innerHTML = `
        <tr class="tr-loading">
            <td colspan="4">
                <div class="table-spinner"></div>
                Cargando…
            </td>
        </tr>`;

    let url = `/api/auditoria/actividad/?page=${_page}`;
    if (_accion) url += `&accion=${encodeURIComponent(_accion)}`;

    const { ok, data } = await fetchAPI(url);
    if (!ok) {
        tbody.innerHTML = `<tr class="tr-empty"><td colspan="4">Error al cargar registros.</td></tr>`;
        return;
    }

    _pages = data.pages;
    renderTabla(data.results);
    renderPaginacion(data.page, data.pages, data.total);
}

// ── Filtros ───────────────────────────────────────────────────────
document.querySelectorAll('.chip-filtro').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-filtro').forEach(c => c.classList.remove('chip--active'));
        chip.classList.add('chip--active');
        _accion = chip.dataset.accion;
        _page   = 1;
        cargar();
    });
});

// ── Paginación ────────────────────────────────────────────────────
btnPrev.addEventListener('click', () => { if (_page > 1)     { _page--; cargar(); } });
btnNext.addEventListener('click', () => { if (_page < _pages) { _page++; cargar(); } });

// ── Inicializar ───────────────────────────────────────────────────
cargar();
