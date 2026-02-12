

/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");




// ✅ same config as your src/firebase/firebase.
firebase.initializeApp({
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  });

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notificationTitle = payload?.notification?.title || "Inventory App";
  const notificationOptions = {
    body: payload?.notification?.body || "New update",
    icon: "/pwa-192x192.png", // optional
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
