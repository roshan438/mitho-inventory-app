import React from "react";

export default function ConfirmModal({
  open,
  title = "Confirm",
  message = "",
  confirmText = "OK",
  cancelText = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 18,
          background: "#fff",
          border: "1px solid rgba(0,0,0,.10)",
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,.18)",
        }}
      >
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          {message ? (
            <div style={{ marginTop: 8, color: "rgba(0,0,0,.7)", lineHeight: 1.35 }}>
              {message}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 16,
            borderTop: "1px solid rgba(0,0,0,.08)",
            background: "rgba(0,0,0,.02)",
          }}
        >
          <button className="btn" style={{ flex: 1 }} onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn ${danger ? "" : "primary"}`}
            style={{
              flex: 1,
              background: danger ? "#b00020" : undefined,
              color: danger ? "white" : undefined,
              borderColor: danger ? "rgba(0,0,0,.08)" : undefined,
            }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
