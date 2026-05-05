const token = localStorage.getItem('access_token');
        const user  = JSON.parse(localStorage.getItem('user') || 'null');
        if (!token || !user || !['Director'].includes(user.tipo_usuario)) {
            window.location.replace('/login/');
        }
