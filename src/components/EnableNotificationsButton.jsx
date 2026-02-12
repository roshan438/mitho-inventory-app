import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { registerPushForUser } from "../notifications/registerPush";

const VAPID_KEY = "YOUR_VAPID_PUBLIC_KEY"; // from Firebase Cloud Messaging

export default function EnableNotificationsButton() {
  const { fbUser, profile } = useAuth();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEnable() {
    setMsg("");
    setBusy(true);
    try {
      const token = await registerPushForUser({
        uid: fbUser?.uid,
        vapidKey: VAPID_KEY,
        platform: isIosPwa() ? "ios-pwa" : "web",
        model: navigator.userAgent,
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

  // Optional: show only for logged in users
  if (!fbUser || !profile) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn primary" disabled={busy} onClick={onEnable}>
        {busy ? "Enabling..." : "Enable Notifications"}
      </button>
      {msg ? <div className="muted" style={{ marginTop: 8 }}>{msg}</div> : null}
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
