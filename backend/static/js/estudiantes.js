'use strict';

/* ================================================================
   estudiantes.js — Grid de cursos + buscador global de estudiantes
   ================================================================ */

const API_CURSOS      = '/api/academics/cursos/';
const API_ESTUDIANTES = '/api/students/';

const CARD_COLORS = [
    { color: '#818cf8', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.25)'  },
    { color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.25)'  },
    { color: '#4ade80', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.22)'   },
    { color: '#22d3ee', bg: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.22)'   },
    { color: '#f472b6', bg: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.22)'  },
    { color: '#fbbf24', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.22)'  },
    { color: '#2dd4bf', bg: 'rgba(20,184,166,0.10)',  border: 'rgba(20,184,166,0.22)'  },
    { color: '#f87171', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.22)'   },
    { color: '#34d399', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.22)'  },
    { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)'  },
];

// ── DOM refs ──────────────────────────────────────────────────────
const grid           = document.getElementById('coursesGrid');
const coursesLoading = document.getElementById('coursesLoading');
const searchInput    = document.getElementById('searchInput');
const searchResults  = document.getElementById('searchResults');
const searchBody     = document.getElementById('searchTableBody');
const searchCount    = document.getElementById('searchCount');
const metricsRow     = document.getElementById('metricsRow');
const metricsInner   = document.getElementById('metricsInner');

let _cursos      = [];
let _searchTimer = null;

// ── Helpers ───────────────────────────────────────────────────────
function shortCode(grado, paralelo) {
    const num = (grado.match(/\d+/) || ['?'])[0];
    return num + paralelo.trim().toUpperCase();
}

function showGrid() {
    grid.classList.remove('hidden');
    searchResults.classList.add('hidden');
}

function showSearch() {
    grid.classList.add('hidden');
    searchResults.classList.remove('hidden');
}

// ── Renderizar métricas ───────────────────────────────────────────
function renderMetricas(lista) {
    const total = lista.reduce((s, c) => s + (c.estudiantes_count ?? 0), 0);
    if (!total) return;

    // Agrupar por grado
    const porGrado = {};
    lista.forEach(c => {
        const g = c.grado;
        porGrado[g] = (porGrado[g] ?? 0) + (c.estudiantes_count ?? 0);
    });

    const gradosOrdenados = Object.keys(porGrado).sort((a, b) => {
        const n = s => parseInt(s.match(/\d+/)?.[0] ?? 0);
        return n(a) - n(b);
    });

    const metricCard = (label, value, accent) => `
        <div style="
            background:var(--bg-card);
            border:1px solid var(--border);
            border-radius:var(--radius-card);
            padding:14px 20px;
            display:flex;flex-direction:column;gap:4px;
            min-width:110px;flex:1;
        ">
            <span style="font-size:.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">${label}</span>
            <span style="font-size:1.6rem;font-weight:700;color:${accent};">${value}</span>
        </div>`;

    let html = metricCard('Total', total, 'var(--accent-text)');
    gradosOrdenados.forEach(g => {
        html += metricCard(g, porGrado[g], 'var(--text-primary)');
    });

    metricsInner.innerHTML = html;
    metricsRow.style.display = 'block';
}

// ── Renderizar grid de cursos ─────────────────────────────────────
function renderCursos(lista) {
    if (coursesLoading) coursesLoading.remove();
    grid.querySelectorAll('.course-card, .courses-empty').forEach(el => el.remove());

    if (!lista.length) {
        grid.insertAdjacentHTML('beforeend', '<p class="courses-empty">No se encontraron cursos.</p>');
        return;
    }

    lista.forEach((curso, i) => {
        const pal   = CARD_COLORS[i % CARD_COLORS.length];
        const code  = shortCode(curso.grado, curso.paralelo);
        const count = curso.estudiantes_count ?? 0;

        const card = document.createElement('a');
        card.className = 'course-card';
        card.href      = `/director/estudiantes/${curso.id}/`;
        card.style.cssText = `--card-color:${pal.color};--card-bg:${pal.bg};--card-border:${pal.border};`;

        card.innerHTML = `
            <div class="course-card__deco">${code}</div>
            <div class="course-card__header">
                <div class="course-badge">${code}</div>
                <span class="course-name">${curso.grado} ${curso.paralelo}</span>
            </div>
            <div class="course-card__footer">
                <span class="course-label">ESTUDIANTES</span>
                <span class="course-count">${count}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ── Renderizar tabla de resultados ────────────────────────────────
function renderResultados(lista) {
    if (!lista.length) {
        searchBody.innerHTML = '<tr class="tr-empty"><td colspan="4">Sin resultados para esa búsqueda.</td></tr>';
        searchCount.textContent = '';
        return;
    }

    searchBody.innerHTML = lista.map((e, i) => `
        <tr>
            <td class="td-num">${i + 1}</td>
            <td class="td-name">${e.nombre_completo}</td>
            <td class="td-mono">${e.identificador || '—'}</td>
            <td><span class="badge-curso">${e.curso_nombre}</span></td>
        </tr>
    `).join('');

    const n = lista.length;
    searchCount.textContent = n === 10
        ? 'Mostrando los primeros 10 resultados'
        : `${n} estudiante${n !== 1 ? 's' : ''} encontrado${n !== 1 ? 's' : ''}`;
}

// ── Buscar estudiantes via API ────────────────────────────────────
async function buscarEstudiantes(q) {
    showSearch();
    searchBody.innerHTML = '<tr class="tr-loading"><td colspan="4"><span class="table-spinner"></span> Buscando…</td></tr>';
    searchCount.textContent = '';

    const { ok, data } = await fetchAPI(`${API_ESTUDIANTES}?q=${encodeURIComponent(q)}`);
    if (!ok) {
        searchBody.innerHTML = '<tr class="tr-empty"><td colspan="4">Error al realizar la búsqueda.</td></tr>';
        return;
    }

    renderResultados(Array.isArray(data) ? data : (data.results ?? []));
}

// ── Input con debounce 350 ms ─────────────────────────────────────
searchInput.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = searchInput.value.trim();
    if (!q) { showGrid(); return; }
    _searchTimer = setTimeout(() => buscarEstudiantes(q), 350);
});

searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; showGrid(); }
});

// ── Cargar cursos al inicio ───────────────────────────────────────
(async () => {
    const { ok, data } = await fetchAPI(API_CURSOS);
    if (!ok) return;
    _cursos = Array.isArray(data) ? data : (data.results ?? []);
    renderMetricas(_cursos);
    renderCursos(_cursos);
})();
