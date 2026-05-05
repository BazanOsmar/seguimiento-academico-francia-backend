'use strict';

    // ── Sidebar ───────────────────────────────────────────────────────
    (function() {
        const sidebar  = document.querySelector('.sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        const btnMenu  = document.getElementById('btnMenu');
        const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
        let timer;
        sidebar.addEventListener('mouseenter', () => { clearTimeout(timer); if (isDesktop()) sidebar.classList.add('sidebar--expanded'); });
        sidebar.addEventListener('mouseleave', () => { if (isDesktop()) timer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200); });
        btnMenu.addEventListener('click', () => {
            sidebar.classList.contains('sidebar--open')
                ? (sidebar.classList.remove('sidebar--open'), backdrop.classList.remove('visible'))
                : (sidebar.classList.add('sidebar--open'), backdrop.classList.add('visible'));
        });
        backdrop.addEventListener('click', () => { sidebar.classList.remove('sidebar--open'); backdrop.classList.remove('visible'); });
        document.getElementById('btnLogout').addEventListener('click', () => {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            window.location.replace('/login/');
        });
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        if (user) document.getElementById('profileRole').textContent = user.tipo_usuario || 'Director';
    })();

    // ── Parámetros de URL ─────────────────────────────────────────────
    const _params = new URLSearchParams(window.location.search);
    const _pcId   = parseInt(_params.get('pc_id') || '0', 10);
    const _mes    = parseInt(_params.get('mes')   || '0', 10);

    // ── Estado ───────────────────────────────────────────────────────
    let _headersPorTrim = {};
    let _metadata       = {};
    let _trimActivo     = '';
    let _cambiosNotas   = {};
    let _mostrarCambios = false;

    const _TRIM_ORDER  = ['1TRIM', '2TRIM', '3TRIM'];
    const _TRIM_LABELS = { '1TRIM': '1er Trimestre', '2TRIM': '2do Trimestre', '3TRIM': '3er Trimestre' };
    const _DIM_MAX_POINTS = { ser: 10, saber: 45, hacer: 40 };
    const _DIM_DEFS = [
        { key: 'saber', label: 'SABER', css: 'saber' },
        { key: 'hacer', label: 'HACER', css: 'hacer' },
        { key: 'ser',   label: 'SER',   css: 'ser'   },
    ];

    // ── Helpers ───────────────────────────────────────────────────────
    function _esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _fmt1(v) {
        return (typeof v === 'number' && isFinite(v)) ? v.toFixed(1) : '–';
    }
    function _avg(arr) {
        const finite = arr.filter(n => typeof n === 'number' && isFinite(n));
        return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN;
    }
    function _shortLabel(titulo, idx) {
        if (!titulo) return `Act.${idx + 1}`;
        // Intentar extraer fecha (dd/mm/yyyy)
        const m = titulo.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
        if (m) return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}`;
        return titulo.length > 12 ? titulo.slice(0, 12) + '…' : titulo;
    }
    function _iniciales(nombre) {
        const partes = (nombre || '').trim().split(/\s+/);
        return ((partes[0]?.[0] || '') + (partes[partes.length - 1]?.[0] || '')).toUpperCase() || '?';
    }

    function _activityHeaderMeta(titulo, idx) {
        const fallback = { date: `Act. ${idx + 1}`, title: 'Actividad' };
        if (!titulo) return fallback;

        const clean = String(titulo).replace(/\s+/g, ' ').trim();
        const m = clean.match(/(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?/);
        const date = m ? `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}` : `Act. ${idx + 1}`;
        const titleRaw = m
            ? clean.replace(m[0], '').replace(/^[\s\-:|,.]+|[\s\-:|,.]+$/g, '')
            : clean;
        const title = titleRaw
            ? (titleRaw.length > 22 ? titleRaw.slice(0, 22) + '…' : titleRaw)
            : 'Actividad';

        return { date, title };
    }

    // ── Bootstrap ─────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        if (!_pcId || !_mes) {
            _mostrarError('Parámetros inválidos', 'Falta pc_id o mes en la URL.');
            return;
        }
        await _cargar();
    });

    async function _cargar() {
        const { ok, data } = await fetchAPI(
            `/api/academics/director/notas-mes-detalle/?pc_id=${_pcId}&mes=${_mes}`
        );

        document.getElementById('nmLoader').style.display = 'none';

        if (!ok || !data.ya_subidas) {
            _mostrarError(
                'Sin notas disponibles',
                ok ? 'Este curso no tiene notas cargadas para el mes seleccionado.' : 'Error al conectar con el servidor.'
            );
            return;
        }

        _headersPorTrim = data.headers_por_trim || {};
        _metadata       = data.metadata || {};
        _cambiosNotas   = _normalizarCambios(data.cambios_notas || []);
        _configurarBotonCambios(data.cambios_notas || []);

        _poblarHeader();
        _poblarTrimTabs();
        _trimActivo = _TRIM_ORDER.find(t => _headersPorTrim[t]) || Object.keys(_headersPorTrim)[0] || '';
        _renderTabla(_trimActivo);
        _activarTab(_trimActivo);

        document.getElementById('nmContent').style.display = '';
        document.getElementById('pageTitle').textContent =
            `${_metadata.materia || '–'} · ${_metadata.curso || '–'}`;
    }

    function _changeKey(trim, dimension, colIdx, estudianteId) {
        return `${trim}|${dimension}|${colIdx}|${estudianteId}`;
    }

    function _normalizarCambios(cambios) {
        const map = {};
        cambios.forEach(c => {
            const trim = `${Number(c.trimestre || 1)}TRIM`;
            map[_changeKey(trim, c.dimension, c.columna_idx, c.estudiante_id)] = c;
        });
        return map;
    }

    function _configurarBotonCambios(cambios) {
        const btn = document.getElementById('nmCambiosBtn');
        if (!btn) return;
        if (!cambios.length) {
            btn.style.display = 'none';
            return;
        }
        btn.style.display = 'inline-flex';
        btn.textContent = `Ver cambios (${cambios.length})`;
        btn.addEventListener('click', () => {
            _mostrarCambios = !_mostrarCambios;
            btn.classList.toggle('active', _mostrarCambios);
            btn.textContent = _mostrarCambios ? `Ocultar cambios (${cambios.length})` : `Ver cambios (${cambios.length})`;
            _renderTabla(_trimActivo);
        });
    }

    function _mostrarError(titulo, msg) {
        document.getElementById('nmLoader').style.display   = 'none';
        document.getElementById('nmContent').style.display  = 'none';
        document.getElementById('nmError').style.display    = '';
        document.getElementById('nmErrorTitle').textContent = titulo;
        document.getElementById('nmErrorMsg').textContent   = msg;
    }

    function _poblarHeader() {
        const { profesor, materia, curso, mes_nombre, gestion } = _metadata;
        document.getElementById('nmAvatar').textContent = _iniciales(profesor || '');
        document.getElementById('nmHeaderTitle').textContent = profesor || '–';

        const tags = [
            { label: materia,           cls: 'nm-tag--blue'   },
            { label: curso,             cls: 'nm-tag--purple' },
            { label: mes_nombre || '',  cls: 'nm-tag--gray'   },
            { label: String(gestion || ''), cls: 'nm-tag--gray' },
        ];
        document.getElementById('nmHeaderTags').innerHTML = tags
            .filter(t => t.label)
            .map(t => `<span class="nm-tag ${t.cls}">${_esc(t.label)}</span>`)
            .join('');
    }

    function _poblarTrimTabs() {
        const cont = document.getElementById('nmTrimTabs');
        cont.innerHTML = _TRIM_ORDER.map(t => {
            const tiene = !!_headersPorTrim[t];
            return `<button class="nm-trim-btn" data-trim="${t}" ${tiene ? '' : 'disabled'} onclick="_activarTab('${t}')">${_TRIM_LABELS[t]}</button>`;
        }).join('');
    }

    function _activarTab(trim) {
        _trimActivo = trim;
        document.querySelectorAll('.nm-trim-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.trim === trim);
        });
        _renderTabla(trim);
    }

    function _renderTabla(trimKey) {
        const scroll = document.getElementById('nmTableScroll');
        const trimData = _headersPorTrim[trimKey];
        if (!trimData) { scroll.innerHTML = ''; return; }

        // Dimensiones con datos
        const dims = _DIM_DEFS
            .map(d => ({ ...d, cols: Array.isArray(trimData[d.key]) ? trimData[d.key] : [] }))
            .filter(d => d.cols.length);

        if (!dims.length) { scroll.innerHTML = ''; return; }

        // Construir mapa de filas: rowKey → { nro, nombre, values }
        const rowMap = new Map();
        const allCellKeys = [];

        dims.forEach(dim => {
            dim.cols.forEach((col, i) => {
                const ck = `${dim.key}-${i}`;
                col.__ck = ck;
                allCellKeys.push(ck);
                (col.notas || []).forEach(n => {
                    const rk = `${n.nro}|${n.nombre}`;
                    if (!rowMap.has(rk)) rowMap.set(rk, { nro: n.nro, nombre: n.nombre, vals: {} });
                    rowMap.get(rk).vals[ck] = Number(n.nota);
                });
            });
        });

        const rows = [...rowMap.values()].sort((a, b) => {
            const na = Number(a.nro) || 0, nb = Number(b.nro) || 0;
            return na - nb || String(a.nombre).localeCompare(String(b.nombre));
        });

        // Calcular promedio como en notas_mensuales:
        // cada dimensión promedia sus actividades y luego se suman SER + SABER + HACER.
        // Si una dimensión no llegó, aporta 0.
        const rowsWithAvg = rows.map(r => {
            const dimScores = { ser: 0, saber: 0, hacer: 0 };

            dims.forEach(d => {
                const totalDim = d.cols.reduce((sum, col) => {
                    const val = r.vals[col.__ck];
                    return sum + (isFinite(val) ? Number(val) : 0);
                }, 0);
                dimScores[d.key] = d.cols.length ? totalDim / d.cols.length : 0;
            });

            const ser   = Math.min(dimScores.ser, _DIM_MAX_POINTS.ser);
            const saber = Math.min(dimScores.saber, _DIM_MAX_POINTS.saber);
            const hacer = Math.min(dimScores.hacer, _DIM_MAX_POINTS.hacer);

            return {
                ...r,
                avg: ser + saber + hacer,
            };
        });

        const overallAvg = _avg(rowsWithAvg.map(r => r.avg).filter(v => isFinite(v)));
        const riskCount  = rowsWithAvg.filter(r => isFinite(r.avg) && r.avg < 60).length;

        // Actualizar stats
        _renderStats(overallAvg, riskCount, rowsWithAvg.length);

        // Colgroup
        const totalCols = dims.reduce((s, d) => s + d.cols.length, 0);
        const colgroup = `<colgroup>
            <col style="width:46px">
            <col style="width:240px">
            ${dims.map(d => d.cols.map(() => '<col>').join('')).join('')}
            <col style="width:70px">
        </colgroup>`;

        // Fila 1: grupos de dimensión
        const groupRow = `<tr>
            <th class="nm-th-nro" rowspan="2">#</th>
            <th class="nm-th-name" rowspan="2">Estudiante</th>
            ${dims.map(d => `<th class="nm-th-group nm-th-group--${d.css}" colspan="${d.cols.length}">${d.label}</th>`).join('')}
            <th class="nm-th-avg" rowspan="2">Prom.</th>
        </tr>`;

        // Fila 2: headers rotados
        const headRow = `<tr>
            ${dims.map(d => d.cols.map((col, i) => {
                const meta = _activityHeaderMeta(col.titulo, i);
                return `
                <th class="nm-th-rot" title="${_esc(col.titulo || '')}">
                    <div class="nm-th-activity">
                        <span class="nm-th-date">${_esc(meta.date)}</span>
                        <span class="nm-th-title">${_esc(meta.title)}</span>
                    </div>
                </th>`;
            }).join('')).join('')}
        </tr>`;

        // Filas de datos
        const dataRows = rowsWithAvg.map(r => {
            const scoresCells = dims.map(d => d.cols.map(col => {
                const v = r.vals[col.__ck];
                const cambio = _cambiosNotas[_changeKey(trimKey, d.key, col.col, r.nro)];
                const cambioCls = cambio && _mostrarCambios ? ' nm-td-score--changed' : '';
                const cambioTitle = cambio
                    ? `Nota anterior: ${_fmt1(Number(cambio.nota_anterior))}`
                    : '';
                return isFinite(v)
                    ? `<td class="nm-td-score${cambioCls}" title="${_esc(cambioTitle)}">
                        <span class="nm-score-current">${_fmt1(v)}</span>
                        ${cambio && _mostrarCambios ? `<span class="nm-score-prev">Antes: ${_fmt1(Number(cambio.nota_anterior))}</span>` : ''}
                    </td>`
                    : `<td class="nm-td-score is-empty">–</td>`;
            }).join('')).join('');

            const avgClass = !isFinite(r.avg) ? '' : r.avg >= 70 ? 'nm-td-avg--ok' : r.avg >= 50 ? 'nm-td-avg--warn' : 'nm-td-avg--bad';

            return `<tr>
                <td class="nm-td-nro">${String(r.nro).padStart(2,'0')}</td>
                <td class="nm-td-name">${_esc(r.nombre)}</td>
                ${scoresCells}
                <td class="nm-td-avg ${avgClass}">${_fmt1(r.avg)}</td>
            </tr>`;
        }).join('');

        scroll.innerHTML = `<table class="nm-table">${colgroup}<thead>${groupRow}${headRow}</thead><tbody>${dataRows}</tbody></table>`;
    }

    function _renderStats(overallAvg, riskCount, total) {
        const avgClass = !isFinite(overallAvg) ? '' : overallAvg >= 70 ? 'nm-stat-val--ok' : overallAvg >= 50 ? 'nm-stat-val--warn' : 'nm-stat-val--bad';
        document.getElementById('nmStats').innerHTML = `
            <div class="nm-stat-card">
                <span class="nm-stat-label">Promedio general</span>
                <span class="nm-stat-val ${avgClass}">${_fmt1(overallAvg)}</span>
            </div>
            <div class="nm-stat-card">
                <span class="nm-stat-label">Total estudiantes</span>
                <span class="nm-stat-val">${total}</span>
            </div>
            <div class="nm-stat-card">
                <span class="nm-stat-label">En riesgo (&lt;60)</span>
                <span class="nm-stat-val ${riskCount > 0 ? 'nm-stat-val--warn' : 'nm-stat-val--ok'}">${riskCount}</span>
            </div>
        `;
    }
