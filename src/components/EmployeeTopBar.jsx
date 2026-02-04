import React from "react";
import useCurrentStoreName from "../hooks/useCurrentStoreName";

export default function EmployeeTopBar({ title, onMenu }) {
  const { storeId, storeName } = useCurrentStoreName();

  return (
    <div className="navbar">
      <div>
        <div style={{ fontWeight: 900, fontSize: 18 }}>
          {title}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          Store: <b>{storeName || storeId || "—"}</b>
        </div>
      </div>

      <button className="btn" onClick={onMenu}>☰</button>
    </div>
  );
}
