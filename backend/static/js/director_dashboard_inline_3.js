(function () {
    const backdrop  = document.getElementById('broadcastBackdrop');
    const btnOpen   = document.getElementById('btnBroadcast');
    const btnClose  = document.getElementById('broadcastCancelar');
    const btnSend   = document.getElementById('broadcastEnviar');
    const inputTit  = document.getElementById('broadcastTitulo');
    const inputMsg  = document.getElementById('broadcastCuerpo');
    const errorEl   = document.getElementById('broadcastError');

    function openModal()  { backdrop.classList.add('visible'); inputTit.focus(); }
    function closeModal() {
        backdrop.classList.remove('visible');
        inputTit.value = '';
        inputMsg.value = '';
        errorEl.style.display = 'none';
        btnSend.disabled = false;
        btnSend.textContent = 'Enviar';
    }

    btnOpen.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

    btnSend.addEventListener('click', async () => {
        const titulo = inputTit.value.trim();
        const cuerpo = inputMsg.value.trim();
        errorEl.style.display = 'none';

        if (!titulo || !cuerpo) {
            errorEl.textContent = 'Completa el título y el mensaje.';
            errorEl.style.display = 'block';
            return;
        }

        btnSend.disabled = true;
        btnSend.textContent = 'Enviando...';

        try {
            const res = await fetchAPI('/api/notifications/broadcast/', {
                method: 'POST',
                body: JSON.stringify({ titulo, cuerpo }),
            });

            if (res.sin_dispositivos) {
                errorEl.textContent = 'No hay dispositivos registrados para recibir notificaciones.';
                errorEl.style.display = 'block';
                btnSend.disabled = false;
                btnSend.textContent = 'Enviar';
                return;
            }

            closeModal();
            if (typeof showAppToast === 'function') {
                showAppToast('success', 'Comunicado enviado',
                    `Entregado a ${res.enviados} dispositivo(s).`);
            }
        } catch (err) {
            errorEl.textContent = err.message || 'Error al enviar. Intenta de nuevo.';
            errorEl.style.display = 'block';
            btnSend.disabled = false;
            btnSend.textContent = 'Enviar';
        }
    });
})();
