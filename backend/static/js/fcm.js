'use strict';

/* ================================================================
   fcm.js — Inicialización de Firebase Messaging en el frontend

   ⚠️  COMPLETA los dos bloques marcados con TODO antes de usar:
       1. firebaseConfig  → Firebase Console → Configuración del
          proyecto → General → tu app web → SDK Config
       2. VAPID_KEY       → Firebase Console → Configuración del
          proyecto → Cloud Messaging → Configuración web
          → Par de claves web
   ================================================================ */

// ── Configuración web de Firebase ─────────────────────────────────
const _FCM_CONFIG = {
    apiKey:            "AIzaSyDr_pBXNjmKGPZZVOI593Xm1getxGTYqB4",
    authDomain:        "seguimiento-academico-f4ee7.firebaseapp.com",
    projectId:         "seguimiento-academico-f4ee7",
    storageBucket:     "seguimiento-academico-f4ee7.firebasestorage.app",
    messagingSenderId: "513504237662",
    appId:             "1:513504237662:web:7d7643ceb37eba10fb7ccf",
};

// ── VAPID key (clave pública web) ──────────────────────────────────
const _VAPID_KEY = "BDBiXcLGx85q-XW01wiJ-49NYzYET61KqHxGyTt0wNJQ35s7jEKY25yX6pATZKTU4mb9G39Ru1ZU4gWJoLjmVbc";

// ─────────────────────────────────────────────────────────────────
const FCM_TOKEN_URL = '/api/notifications/fcm/token/';

let _fcmToken = null;

async function initFCM() {
    // Verificar soporte del navegador
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.info('FCM: navegador sin soporte de notificaciones.');
        return;
    }

    // Pedir permiso
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
        console.info('FCM: permiso de notificaciones denegado.');
        return;
    }

    try {
        // Inicializar Firebase (evitar doble inicialización)
        if (!firebase.apps.length) {
            firebase.initializeApp(_FCM_CONFIG);
        }

        const messaging = firebase.messaging();

        // Registrar el Service Worker
        const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Obtener token FCM
        _fcmToken = await messaging.getToken({ vapidKey: _VAPID_KEY, serviceWorkerRegistration: sw });
        if (!_fcmToken) return;

        // Registrar token en el backend
        await fetchAPI(FCM_TOKEN_URL, {
            method: 'POST',
            body: JSON.stringify({ token: _fcmToken }),
        });

        // Manejar notificaciones con la app en primer plano
        messaging.onMessage((payload) => {
            const titulo = payload.notification?.title || 'Seguimiento Académico';
            const cuerpo = payload.notification?.body  || '';
            // Usa el sistema de toasts del proyecto si está disponible
            if (typeof showAppToast === 'function') {
                showAppToast('info', titulo, cuerpo);
            } else {
                console.info(`[FCM] ${titulo}: ${cuerpo}`);
            }
        });

    } catch (err) {
        console.warn('FCM init error:', err);
    }
}

// Eliminar token al cerrar sesión
async function logoutFCM() {
    if (!_fcmToken) return;
    await fetchAPI(FCM_TOKEN_URL, {
        method: 'DELETE',
        body: JSON.stringify({ token: _fcmToken }),
    });
}
