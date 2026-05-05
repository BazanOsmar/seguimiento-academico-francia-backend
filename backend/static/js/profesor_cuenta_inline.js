(function () {
    const modal       = document.getElementById('modalSugerencia');
    const inputSug    = document.getElementById('inputSugerencia');
    const contador    = document.getElementById('contadorSugerencia');
    const errEl       = document.getElementById('errSugerencia');
    const exitoEl     = document.getElementById('sugerenciaExito');
    const btnEnviar   = document.getElementById('btnEnviarSugerencia');
    const btnCancelar = document.getElementById('btnCancelarSugerencia');

    function abrirModal() {
        inputSug.value = '';
        contador.textContent = '0/1000';
        errEl.style.display = 'none';
        exitoEl.style.display = 'none';
        btnEnviar.style.display = '';
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar';
        btnCancelar.textContent = 'Cancelar';
        modal.style.display = 'flex';
        inputSug.focus();
    }

    function cerrarModal() { modal.style.display = 'none'; }

    document.getElementById('btnAbrirSugerencias').addEventListener('click', abrirModal);
    btnCancelar.addEventListener('click', cerrarModal);
    modal.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });

    inputSug.addEventListener('input', () => {
        contador.textContent = `${inputSug.value.length}/1000`;
        errEl.style.display = 'none';
    });

    btnEnviar.addEventListener('click', async () => {
        const msg = inputSug.value.trim();
        if (!msg) {
            errEl.textContent = 'El mensaje no puede estar vacío.';
            errEl.style.display = 'block';
            return;
        }
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Enviando…';
        const res = await fetchAPI('/api/auth/sugerencias/', {
            method: 'POST',
            body: JSON.stringify({ mensaje: msg }),
        });
        if (res.ok || res.status === 204) {
            exitoEl.style.display = 'block';
            btnEnviar.style.display = 'none';
            btnCancelar.textContent = 'Cerrar';
        } else {
            errEl.textContent = res.data?.errores || 'No se pudo enviar. Intenta más tarde.';
            errEl.style.display = 'block';
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar';
        }
    });
})();
