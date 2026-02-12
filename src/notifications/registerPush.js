// src/notifications/registerPush.js
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { db } from "../firebase/firebase";
import { getAppMessaging } from "../firebase/firebase";

/**
 * Register for push and store token in:
 * 1) users/{uid}/devices/{token}
 * 2) stores/{storeId}/notificationSubscribers/{uid}/devices/{token}
 */
export async function registerPushForUser({
  uid,
  storeId,           // ✅ NEW
  vapidKey,
  platform = "web",
  model = "",
  userName = "",     // optional
  role = "",         // optional
}) {
  if (!uid) throw new Error("Missing uid");
  if (!storeId) throw new Error("Missing storeId");
  if (!vapidKey) throw new Error("Missing VAPID key");

  // 1) Request permission
  if (!("Notification" in window)) throw new Error("Notifications not supported");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission not granted");

  // 2) Register service worker
  if (!("serviceWorker" in navigator)) throw new Error("Service worker not supported");
  const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });

  // 3) Get FCM token
  const messaging = await getAppMessaging();
  if (!messaging) throw new Error("Messaging not supported on this device/browser");

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swReg,
  });

  if (!token) throw new Error("No FCM token returned");

  const now = serverTimestamp();

  // ✅ A) Save device under user
  const userDeviceRef = doc(db, "users", uid, "devices", token);
  await setDoc(
    userDeviceRef,
    {
      token,
      platform,
      model,
      enabled: true,
      storeIdLast: storeId,
      userAgent: navigator.userAgent,
      createdAt: now,
      lastSeenAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // ✅ B) Ensure subscriber doc exists (nice for admin listing)
  const subscriberRef = doc(db, "stores", storeId, "notificationSubscribers", uid);
  await setDoc(
    subscriberRef,
    {
      uid,
      name: userName || "",
      role: role || "",
      enabled: true,
      updatedAt: now,
      lastEnabledAt: now,
    },
    { merge: true }
  );

  // ✅ C) Save device under store subscriber
  const storeDeviceRef = doc(db, "stores", storeId, "notificationSubscribers", uid, "devices", token);
  await setDoc(
    storeDeviceRef,
    {
      token,
      platform,
      model,
      enabled: true,
      createdAt: now,
      lastSeenAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return token;
}
