import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { STORES } from "../utils/constants";

export default function StoreSelect() {
  const nav = useNavigate();
  const { profile, loading, logout } = useAuth();
  const { setStoreId } = useStore();

  const allowed = useMemo(() => profile?.allowedStores || [], [profile]);

  if (loading) {
    return (
      <div className="page">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <div className="muted">Profile missing. Please login again.</div>
        <button className="btn" onClick={() => nav("/")}>Go to Login</button>
      </div>
    );
  }

  function choose(id) {
    setStoreId(id);
    nav(profile.role === "admin" ? "/admin" : "/employee");
  }

  return (
    <div className="page">
      <div className="navbar">
        <div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Choose Store</div>
          <div className="muted" style={{ margin: 0 }}>
            {profile.name || profile.employeeId} • {profile.role}
          </div>
        </div>
        <button className="btn ghost" onClick={logout}>Logout</button>
      </div>

      <div className="card">
        {allowed.length === 0 ? (
          <div className="muted">No store assigned. Ask admin to assign you a store.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {allowed.map((id) => (
              <button
                key={id}
                className="btn primary"
                onClick={() => choose(id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 16 }}>{STORES[id] || id}</span>
                <span style={{ opacity: 0.7 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
