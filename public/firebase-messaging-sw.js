

/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

// ✅ same config as your src/firebase/firebase.js
firebase.initializeApp({
    apiKey: "AIzaSyC1pGbpEnduwnH0NBvS6V7gZrwP23xg2nI",
  authDomain: "mitho-inventory-app.firebaseapp.com",
  projectId: "mitho-inventory-app",
  storageBucket: "mitho-inventory-app.firebasestorage.app",
  messagingSenderId: "731468109014",
  appId: "1:731468109014:web:278ca270db5d4d6159a577",
  measurementId: "G-7MDH29MQ4B"

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
