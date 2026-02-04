import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

export default function TopBar({ title, showBack = false }) {
  const nav = useNavigate();
  const { profile, logout } = useAuth();
  const { storeId } = useStore();

  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!storeId) {
        setStoreName("");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "stores", storeId));
        const name = snap.exists() ? snap.data()?.name : "";
        if (!cancelled) setStoreName(name || storeId);
      } catch {
        if (!cancelled) setStoreName(storeId);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  return (
    <div className="navbar" style={{ justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {showBack ? (
          <button className="btn" onClick={() => nav(-1)}>
            Back
          </button>
        ) : null}

        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {title || (profile?.role === "admin" ? "Admin" : "Employee")}
          </div>

          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {storeId ? (
              <>
                Store: <b>{storeName || storeId}</b>
              </>
            ) : (
              "No store selected"
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" onClick={() => nav("/stores")}>
          Switch Store
        </button>
        <button className="btn ghost" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
