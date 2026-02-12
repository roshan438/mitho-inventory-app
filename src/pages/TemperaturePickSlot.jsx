import React from "react";
import { useNavigate } from "react-router-dom";

export default function TemperaturePickSlot() {
  const nav = useNavigate();

  return (
    <div className="page">
      <div className="card" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems:'center' }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
            <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Temperature Logs</div>
                <div className="muted" style={{ marginTop: 6 }}>
                    Choose which log you want to record for today.
                </div>
            </div>
            <button className="btn" onClick={() => nav("/employee")} style={{ padding: "8px 16px", width:'68px' }}>
          Back
        </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn primary" onClick={() => nav("/employee/temperature/log1")}>
            Log 1
          </button>
          <button className="btn primary" onClick={() => nav("/employee/temperature/log2")}>
            Log 2
          </button>
        </div>
      </div>
    </div>
  );
}
