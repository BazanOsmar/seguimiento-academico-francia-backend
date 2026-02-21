/* ================================================================
   firebase-messaging-sw.js — Service Worker para FCM
   Servido en /firebase-messaging-sw.js por Django (ver config/urls.py)

   ⚠️  COMPLETA los valores de firebaseConfig con los de tu proyecto:
       Firebase Console → Configuración del proyecto → General
       → Tus apps → (tu app web) → Configuración del SDK
   ================================================================ */

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            "TU_API_KEY",
    authDomain:        "TU_PROJECT_ID.firebaseapp.com",
    projectId:         "TU_PROJECT_ID",
    storageBucket:     "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId:             "TU_APP_ID",
});

const messaging = firebase.messaging();

// Notificaciones en segundo plano (app cerrada o minimizada)
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'Seguimiento Académico';
    const body  = payload.notification?.body  || '';

    self.registration.showNotification(title, {
        body,
        icon: '/static/img/logo_francia.png',
        badge: '/static/img/logo_francia.png',
    });
});
