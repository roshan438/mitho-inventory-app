import React from "react";

export default function SideMenu({
  open,
  onClose,
  onAllItems,
  onTempLog,
  onSwitchStore,
  onLogout,
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "78%",
          maxWidth: 340,
          background: "#fff",
          borderLeft: "1px solid rgba(0,0,0,.1)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
          Menu
        </div>

        <button className="btn" onClick={onAllItems || (() => {})}>
          All Items
        </button>

        <button className="btn" onClick={onTempLog || (() => {})}>
          Temperature Log
        </button>

        <button className="btn" onClick={onSwitchStore || (() => {})}>
          Switch Store
        </button>

        <button className="btn" onClick={onLogout || (() => {})}>
          Logout
        </button>

        <button
          className="btn ghost"
          style={{ marginTop: "auto" }}
          onClick={onClose}
        >
          Close
        </button>

      </div>
    </div>
  );
}
