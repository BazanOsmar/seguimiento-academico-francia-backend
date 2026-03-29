'use strict';

/* ================================================================
   estudiantes.js — Grid de cursos y métricas de estudiantes
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
const grid         = document.getElementById('coursesGrid');
const coursesLoading = document.getElementById('coursesLoading');
const metricsRow   = document.getElementById('metricsRow');
const metricsInner = document.getElementById('metricsInner');

let _cursos = [];

// ── Helpers ───────────────────────────────────────────────────────
function shortCode(grado, paralelo) {
    const num = (grado.match(/\d+/) || ['?'])[0];
    return num + paralelo.trim().toUpperCase();
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
        <div class="metric-card">
            <span class="metric-card__label">${label}</span>
            <span class="metric-card__value" style="color:${accent};">${value}</span>
        </div>`;

    let html = metricCard('Total', total, 'var(--accent-text)');
    gradosOrdenados.forEach(g => {
        html += metricCard(g, porGrado[g], 'var(--text-primary)');
    });

    metricsInner.innerHTML = html;
    metricsRow.style.display = 'flex';
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
            <div class="course-card__deco">${curso.grado} ${curso.paralelo}</div>
            <div class="course-card__header">
                <div class="course-badge">${curso.grado} ${curso.paralelo}</div>
            </div>
            <div class="course-card__footer">
                <span class="course-label">ESTUDIANTES</span>
                <span class="course-count">${count}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ── Cargar cursos al inicio ───────────────────────────────────────
(async () => {
    const { ok, data } = await fetchAPI(API_CURSOS);
    if (!ok) return;
    _cursos = Array.isArray(data) ? data : (data.results ?? []);
    renderMetricas(_cursos);
    renderCursos(_cursos);
})();
