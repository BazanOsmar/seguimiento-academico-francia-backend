const token = localStorage.getItem('access_token');
        const user  = JSON.parse(localStorage.getItem('user') || 'null');
        if (!token || !user || user.tipo_usuario !== 'Profesor') {
            window.location.replace('/login/');
        }
