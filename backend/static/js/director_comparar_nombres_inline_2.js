const fileInput     = document.getElementById('fileInput');
const fileNameEl    = document.getElementById('fileName');
const btnComparar   = document.getElementById('btnComparar');
const errorBanner   = document.getElementById('errorBanner');
const cursoDetEl    = document.getElementById('cursoDetectado');
const resultSection = document.getElementById('resultSection');

fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    fileNameEl.textContent      = f ? f.name : 'Ningún archivo seleccionado';
    btnComparar.disabled        = !f;
    errorBanner.style.display   = 'none';
    cursoDetEl.style.display    = 'none';
    resultSection.style.display = 'none';
});

btnComparar.addEventListener('click', async () => {
    const f = fileInput.files[0];
    if (!f) return;

    btnComparar.disabled    = true;
    btnComparar.innerHTML   = '<span class="spinner"></span>';
    errorBanner.style.display   = 'none';
    cursoDetEl.style.display    = 'none';
    resultSection.style.display = 'none';

    const form = new FormData();
    form.append('archivo', f);

    const { ok, data } = await fetchAPI('/api/academics/director/comparar-nombres/', {
        method: 'POST',
        body: form,
    });

    btnComparar.disabled     = false;
    btnComparar.textContent  = 'Comparar';

    if (!ok) {
        errorBanner.textContent   = data?.errores || 'Error al procesar el archivo.';
        errorBanner.style.display = 'block';
        return;
    }

    cursoDetEl.innerHTML     = `Curso detectado: <strong>${_esc(data.curso_nombre)}</strong>`;
    cursoDetEl.style.display = 'block';
    _renderResultados(data);
});

function _renderResultados(d) {
    document.getElementById('statsRow').innerHTML = `
        <div class="stat-chip stat-chip--ok">
            <span class="stat-chip__val">${d.en_ambos}</span>coinciden
        </div>
        <div class="stat-chip ${d.solo_en_excel.length ? 'stat-chip--warn' : ''}">
            <span class="stat-chip__val">${d.solo_en_excel.length}</span>solo en Excel
        </div>
        <div class="stat-chip ${d.solo_en_bd.length ? 'stat-chip--err' : ''}">
            <span class="stat-chip__val">${d.solo_en_bd.length}</span>solo en BD
        </div>
        <div class="stat-chip">
            <span class="stat-chip__val">${d.total_excel}</span>total Excel
        </div>
        <div class="stat-chip">
            <span class="stat-chip__val">${d.total_bd}</span>total BD
        </div>
    `;

    document.getElementById('listExcel').innerHTML = d.solo_en_excel.length
        ? d.solo_en_excel.map(n => `
            <div class="result-item">
                <span class="result-item__dot result-item__dot--excel"></span>${_esc(n)}
            </div>`).join('')
        : '<p class="empty-msg">Sin diferencias</p>';

    document.getElementById('listBd').innerHTML = d.solo_en_bd.length
        ? d.solo_en_bd.map(n => `
            <div class="result-item">
                <span class="result-item__dot result-item__dot--bd"></span>${_esc(n)}
            </div>`).join('')
        : '<p class="empty-msg">Sin diferencias</p>';

    resultSection.style.display = 'block';
}

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
