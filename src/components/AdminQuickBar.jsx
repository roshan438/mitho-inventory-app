import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function AdminQuickBar({ unreadStockCount, unreadTempCount}) {
  const nav = useNavigate();
  const loc = useLocation();

  const isActive = (path) => loc.pathname.startsWith(path);

  return (
    <div className="quickbar">
      <button
        className={`quickbtn ${isActive("/admin/submissions") ? "active" : ""}`}
        onClick={() => nav("/admin/submissions")}
      >
        <span className="ico">📥</span>
        <span className="txt">Stock Logs</span>
        {unreadStockCount > 0 ? <span className="adminBadgeDot needTopRight">{unreadStockCount}</span> : null}
      </button>

      <button
        className={`quickbtn ${isActive("/admin/temperature") ? "active" : ""}`}
        onClick={() => nav("/admin/temperature")}
      >
        <span className="ico">🔥</span>
        <span className="txt">Temperature Logs</span>
        {unreadTempCount > 0 ? <span className="adminBadgeDot needTopRight">{unreadTempCount}</span> : null}
      </button>

      <button
        className={`quickbtn ${isActive("/admin/summary") ? "active" : ""}`}
        onClick={() => nav("/admin/summary")}
      >
        <span className="ico">🗓️</span>
        <span className="txt">Summary</span>
      </button>
    </div>
  );
}
