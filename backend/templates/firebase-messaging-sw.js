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
    apiKey:            "AIzaSyDr_pBXNjmKGPZZVOI593Xm1getxGTYqB4",
    authDomain:        "seguimiento-academico-f4ee7.firebaseapp.com",
    projectId:         "seguimiento-academico-f4ee7",
    storageBucket:     "seguimiento-academico-f4ee7.firebasestorage.app",
    messagingSenderId: "513504237662",
    appId:             "1:513504237662:web:7d7643ceb37eba10fb7ccf",
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
