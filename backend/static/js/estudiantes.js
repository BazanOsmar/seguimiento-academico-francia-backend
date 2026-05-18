'use strict';

/* ================================================================
   estudiantes.js — Grid de cursos y métricas de estudiantes
   ================================================================ */

const API_CURSOS      = '/api/academics/cursos/';
const API_ESTUDIANTES = '/api/students/';

const CARD_NEUTRAL = {
    color:  '#60a5fa',
    bg:     'rgba(59,130,246,0.10)',
    border: 'rgba(59,130,246,0.25)',
};

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
        const pal   = CARD_NEUTRAL;
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
