import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext"; // ✅ NEW
import { registerPushForUser } from "../notifications/registerPush";

const VAPID_KEY =
  "BOKXJdWNLB3UVFj3JDy4qTzz-hINAS9Y3myTC2rE8BnUz1fGLrgwdYjESdx8D1ZTA-P-8RYw3Ix7WSmPTOVOmTM";

export default function EnableNotificationsButton() {
  const { fbUser, profile } = useAuth();
  const { storeId } = useStore(); // ✅ NEW

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEnable() {
    setMsg("");
    setBusy(true);

    try {
      if (!fbUser?.uid) throw new Error("Not logged in");
      if (!storeId) throw new Error("No store selected");

      const token = await registerPushForUser({
        uid: fbUser.uid,
        storeId, // ✅ REQUIRED so it writes to stores/{storeId}/notificationSubscribers
        vapidKey: VAPID_KEY,
        platform: isIosPwa() ? "ios-pwa" : "web",
        model: getDeviceModel(),
        userName: profile?.name || "",
        role: profile?.role || "",
      });

      setMsg("Notifications enabled ✅");
      console.log("FCM token:", token);
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Failed to enable notifications");
    } finally {
      setBusy(false);
    }
  }

  if (!fbUser || !profile) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn primary" disabled={busy} onClick={onEnable}>
        {busy ? "Enabling..." : "Enable Notifications"}
      </button>

      {msg ? (
        <div className="muted" style={{ marginTop: 8 }}>
          {msg}
        </div>
      ) : null}
    </div>
  );
}

function isIosPwa() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  return isIOS && isStandalone;
}

function getDeviceModel() {
  // keep it simple but useful
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return `${platform} | ${ua}`;
}
