import React from "react";

export default function EmployeeTopBar({ title, onMenu }) {
  return (
    <div className="navbar">
      <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
      <button className="btn" onClick={onMenu}>☰</button>
    </div>
  );
}
