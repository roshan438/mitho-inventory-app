// src/pages/TemperatureLogsAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  collection, 
  doc, 
  onSnapshot, 
  orderBy, 
  query, 
  limit, 
  updateDoc 
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

function badgeText(day) {
  const count = Number(day?.checkCount || 0);
  if (count < 2) return `PENDING (${count}/2)`;
  if (day?.hasOutOfRange) return "ALERT";
  if (day?.needsAdminReview) return "REVIEW";
  return "OK";
}

function badgeClass(day) {
  const count = Number(day?.checkCount || 0);
  if (count < 2) return "badge gray";
  if (day?.hasOutOfRange) return "badge red";
  if (day?.needsAdminReview) return "badge orange";
  return "badge green";
}

function formatTs(ts) {
  try {
    if (!ts) return "";
    const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export default function TemperatureLogsAdmin() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { storeId } = useStore();

  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState([]);

  useEffect(() => {
    if (profile && profile.role !== "admin") nav("/employee");
  }, [profile, nav]);

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "stores", storeId, "temperatureLogs"),
      orderBy("__name__", "desc"),
      limit(90)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDays(rows);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setDays([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId, nav]);

  const enriched = useMemo(() => {
    return (days || []).map((d) => {
      const count = Number(d?.checkCount || 0);
      return {
        ...d,
        checkCount: count,
        ymd: d?.submittedDate || d?.id,
      };
    });
  }, [days]);

  // ✅ Fixed Click Handler: Navigates AND updates Firestore
  const handleRowClick = async (d) => {
    nav(`/admin/temperature/${d.ymd}`);

    if (d.needsAdminReview || d.isReadByAdmin == false
    ) {
      try {
        const docRef = doc(db, "stores", storeId, "temperatureLogs", d.id);
        await updateDoc(docRef, {
          needsAdminReview: false,
          isReadByAdmin: true
        });
      } catch (err) {
        console.error("Error clearing review flag:", err);
      }
    }
  };

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 900 }}>Temperature Logs</div>
        <button className="btn" onClick={() => nav("/admin")}>Back</button>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Store: <b>{storeId}</b>
      </div>

      {loading ? (
        <div className="muted" style={{ marginTop: 12 }}>Loading…</div>
      ) : enriched.length === 0 ? (
        <div className="muted" style={{ marginTop: 12 }}>No temperature logs yet.</div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {enriched.map((d) => (
            <div
              key={d.id}
              className="list-card"
              role="button"
              onClick={() => handleRowClick(d)}
              style={{ cursor: "pointer" }}
            >
              <div>
                <div
                  className="list-title"
                  style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                >
                  <span>{d.ymd}</span>

                  <span className={badgeClass(d)}>{badgeText(d)}</span>

                  <span className="meta" style={{ fontWeight: 900 }}>
                    Checks: {Number(d?.checkCount || 0)}/2
                  </span>

                  {d?.hasOutOfRange ? (
                    <span className="meta" style={{ fontWeight: 900 }}>
                      ⚠️ Out of range
                    </span>
                  ) : null}
                </div>

                <div className="meta">
                  Updated by: <b>{d?.updatedByName || d?.submittedByName || "-"}</b>
                  {d?.lastCheckAt ? (
                    <> • Last check: <b>{formatTs(d.lastCheckAt)}</b></>
                  ) : null}
                </div>
              </div>

              <div className="list-right">›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}