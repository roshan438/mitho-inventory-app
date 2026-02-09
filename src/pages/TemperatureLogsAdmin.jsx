// src/pages/TemperatureLogsAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

function inferRangeFromLabel(label = "") {
  const s = String(label).toLowerCase();
  if (s.includes("freezer")) return { min: -25, max: -15 };
  return { min: 0, max: 5 };
}

function computeOutOfRange(equipment = {}, equipmentList = []) {
  const byId = new Map((equipmentList || []).map((e) => [e.id, e]));
  let outCount = 0;

  for (const [eqId, v] of Object.entries(equipment || {})) {
    const label = v?.label || byId.get(eqId)?.label || eqId;
    const temp = typeof v?.temp === "number" ? v.temp : Number(v?.temp);
    const cfg = byId.get(eqId);
    const range = {
      min: typeof cfg?.min === "number" ? cfg.min : inferRangeFromLabel(label).min,
      max: typeof cfg?.max === "number" ? cfg.max : inferRangeFromLabel(label).max,
    };
    const bad = Number.isFinite(temp) ? (temp < range.min || temp > range.max) : false;
    if (bad) outCount += 1;
  }

  return { outCount, hasOutOfRange: outCount > 0 };
}

function badgeText(log) {
  if (log?.hasOutOfRange) return "ALERT";
  if (log?.needsAdminReview) return "REVIEW";
  return "OK";
}

function badgeClass(log) {
  if (log?.hasOutOfRange) return "badge red";
  if (log?.needsAdminReview) return "badge orange";
  return "badge green";
}

export default function TemperatureLogsAdmin() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { storeId } = useStore();

  const [loading, setLoading] = useState(true);
  const [equipmentList, setEquipmentList] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (profile && profile.role !== "admin") nav("/employee");
  }, [profile, nav]);

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }
    const storeRef = doc(db, "stores", storeId);
    const unsub = onSnapshot(storeRef, (snap) => {
      const data = snap.data() || {};
      setEquipmentList(Array.isArray(data.temperatureEquipment) ? data.temperatureEquipment : []);
    });
    return () => unsub();
  }, [storeId, nav]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);

    const q = query(
      collection(db, "stores", storeId, "temperatureLogs"),
      orderBy("submittedDate", "desc"),
      limit(90)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLogs([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId]);

  const enriched = useMemo(() => {
    return logs.map((l) => {
      const { hasOutOfRange, outCount } = computeOutOfRange(l.equipment || {}, equipmentList);
      return { ...l, hasOutOfRange, outCount };
    });
  }, [logs, equipmentList]);

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
          {enriched.map((l) => (
            <div
              key={l.id}
              className="list-card"
              role="button"
              onClick={() => nav(`/admin/temperature/${l.submittedDate || l.id}`)}
              style={{ cursor: "pointer" }}
            >
              <div>
                <div className="list-title" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span>{l.submittedDate || l.id}</span>
                  <span className={badgeClass(l)}>{badgeText(l)}</span>
                  {l.hasOutOfRange ? (
                    <span className="meta" style={{ fontWeight: 900 }}>
                      {l.outCount} out of range
                    </span>
                  ) : null}
                </div>

                <div className="meta">
                  By: <b>{l.submittedByName || l.submittedByEmployeeId || "-"}</b>
                  {l.lastEditedAt ? (
                    <> • Edited by <b>{l.lastEditedByName || l.lastEditedByEmployeeId || "-"}</b></>
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
