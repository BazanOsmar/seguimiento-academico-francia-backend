(function () {
    const backdrop   = document.getElementById('importarBackdrop');
    const btnAbrir   = document.getElementById('btnImportarExcel');
    const btnCerrar  = document.getElementById('btnCerrarImportar');
    const btnCancel  = document.getElementById('btnCancelarImportar');
    const btnProcesar = document.getElementById('btnProcesarImportar');
    const dropZone   = document.getElementById('importDropZone');
    const fileInput  = document.getElementById('importExcelInput');
    const nombreEl   = document.getElementById('importNombreArchivo');
    const errorEl    = document.getElementById('importError');

    let archivoSeleccionado = null;

    function abrirModal()  { backdrop.classList.add('visible'); }
    function cerrarModal() {
        backdrop.classList.remove('visible');
        resetModal();
    }
    function resetModal() {
        fileInput.value = '';
        archivoSeleccionado = null;
        nombreEl.style.display = 'none';
        nombreEl.textContent   = '';
        dropZone.classList.remove('ready', 'over');
        btnProcesar.disabled = true;
        errorEl.style.display = 'none';
    }

    function setArchivo(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(ext)) {
            errorEl.textContent  = 'Solo se aceptan archivos .xlsx o .xls';
            errorEl.style.display = 'block';
            return;
        }
        archivoSeleccionado = file;
        errorEl.style.display = 'none';
        nombreEl.textContent  = '📄 ' + file.name;
        nombreEl.style.display = 'block';
        dropZone.classList.add('ready');
        btnProcesar.disabled = false;
    }

    btnAbrir.addEventListener('click', abrirModal);
    btnCerrar.addEventListener('click', cerrarModal);
    btnCancel.addEventListener('click', cerrarModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) cerrarModal(); });

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) setArchivo(fileInput.files[0]); });

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('over');
        if (e.dataTransfer.files[0]) setArchivo(e.dataTransfer.files[0]);
    });

    btnProcesar.addEventListener('click', async () => {
        const archivo = archivoSeleccionado;
        if (!archivo) return;

        btnProcesar.disabled = true;
        btnProcesar.textContent = 'Importando...';
        errorEl.style.display = 'none';

        const formData = new FormData();
        formData.append('archivo', archivo);

        // Usamos fetch nativo: fetchAPI fuerza Content-Type:application/json
        // lo que rompe el boundary de multipart/form-data
        const token = localStorage.getItem('access_token');
        let ok, data;
        try {
            const res = await fetch('/api/students/importar-excel/', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            data = await res.json();
            ok   = res.ok;
        } catch {
            data = { errores: 'Error de conexión.' };
            ok   = false;
        }

        btnProcesar.disabled = false;
        btnProcesar.textContent = 'Importar Estudiantes';

        if (!ok) {
            errorEl.textContent  = data?.errores || 'Error al procesar el archivo.';
            errorEl.style.display = 'block';
            return;
        }

        cerrarModal();

        const msg = `${data.importados} estudiante(s) importados.` +
            (data.omitidos ? ` ${data.omitidos} omitidos por duplicado.` : '');
        showAppToast(data.importados > 0 ? 'success' : 'warning', 'Importación completada', msg);

        // Recargar la página para mostrar los cursos actualizados
        setTimeout(() => window.location.reload(), 1800);
    });
})();
