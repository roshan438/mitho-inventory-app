import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

export default function StoreSelect() {
  const nav = useNavigate();
  const { profile, loading, logout } = useAuth();
  const { setStoreId } = useStore();

  // ✅ support both old + new profile fields
  const allowed = useMemo(() => {
    const a =
      (Array.isArray(profile?.storeIds) && profile.storeIds) ||
      (Array.isArray(profile?.allowedStores) && profile.allowedStores) ||
      [];
    return a;
  }, [profile]);

  // ✅ optional: show default store first
  const orderedAllowed = useMemo(() => {
    if (!allowed.length) return [];
    const def = profile?.defaultStoreId;
    if (def && allowed.includes(def)) {
      return [def, ...allowed.filter((x) => x !== def)];
    }
    return allowed;
  }, [allowed, profile]);

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
            {profile.name || profile.employeeId || profile.email} • {profile.role}
          </div>
        </div>
        <button className="btn ghost" onClick={logout}>Logout</button>
      </div>

      <div className="card">
        {orderedAllowed.length === 0 ? (
          <div className="muted">No store assigned. Ask admin to assign you a store.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orderedAllowed.map((id) => (
              <button
                key={id}
                className="btn primary"
                onClick={() => choose(id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 16 }}>{id}</span>
                <span style={{ opacity: 0.7 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
