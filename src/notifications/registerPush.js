// src/notifications/registerPush.js
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { db } from "../firebase/firebase";
import { getAppMessaging } from "../firebase/firebase";

/**
 * Register for push and store token in:
 * users/{uid}/devices/{token}
 */
export async function registerPushForUser({
  uid,
  vapidKey,
  platform = "web",
  model = "",
}) {
  if (!uid) throw new Error("Missing uid");
  if (!vapidKey) throw new Error("Missing VAPID key");

  // 1) Request permission
  if (!("Notification" in window)) throw new Error("Notifications not supported");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission not granted");

  // 2) Register service worker (required for FCM Web Push)
  if (!("serviceWorker" in navigator)) throw new Error("Service worker not supported");

  const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {scope:"/",});

  // 3) Get FCM token
  const messaging = await getAppMessaging();
  if (!messaging) throw new Error("Messaging not supported on this device/browser");

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swReg,
  });

  if (!token) throw new Error("No FCM token returned");

  // 4) Save token into Firestore
  const ref = doc(db, "users", uid, "devices", token);
  await setDoc(
    ref,
    {
      token,
      platform, // "ios-pwa" | "web" | "android"
      model,
      enabled: true,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true }
  );

  return token;
}
