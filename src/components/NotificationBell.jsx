import React from "react";

export default function NotificationBell({ count = 0, onClick }) {
  return (
    <button
      className="btn"
      onClick={onClick}
      style={{ position: "relative", paddingRight: 16 }}
      aria-label="Notifications"
    >
      🔔
      {count > 0 ? (
        <span
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            borderRadius: 999,
            background: "#b00020",
            color: "white",
            fontSize: 12,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 6px",
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
