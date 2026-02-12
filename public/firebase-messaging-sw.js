/* public/firebase-messaging-sw.js */
/* global importScripts, firebase */

importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

// ✅ same config as your src/firebase/firebase.js
firebase.initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
});


const messaging = firebase.messaging();

// Optional: customize background notification handling
messaging.onBackgroundMessage((payload) => {
  // payload.notification: { title, body }
  const title = payload?.notification?.title || "Inventory App";
  const options = {
    body: payload?.notification?.body || "New update",
    icon: "/pwa-192x192.png", // optional if you have icons
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});
