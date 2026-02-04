import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function AdminQuickBar() {
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
        <span className="txt">Submissions</span>
      </button>

      <button
        className={`quickbtn ${isActive("/admin/items") ? "active" : ""}`}
        onClick={() => nav("/admin/items")}
      >
        <span className="ico">📦</span>
        <span className="txt">Items</span>
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
