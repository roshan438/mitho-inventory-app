// src/pages/TemperatureLogAdminDay.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";

function formatTs(ts) {
  try {
    if (!ts) return "";
    const d = ts?.toDate?.() ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function pillClass(kind) {
  if (kind === "ALERT") return "badge red";
  if (kind === "OK") return "badge green";
  if (kind === "PENDING") return "badge gray";
  return "badge gray";
}

export default function TemperatureLogAdminDay() {
  const nav = useNavigate();
  const { ymd } = useParams();
  const { storeId } = useStore();

  const [day, setDay] = useState(null);
  const [log1, setLog1] = useState(null);
  const [log2, setLog2] = useState(null);
  const [loading, setLoading] = useState(true);

  const dayRef = useMemo(() => {
    if (!storeId || !ymd) return null;
    return doc(db, "stores", storeId, "temperatureLogs", ymd);
  }, [storeId, ymd]);

  const log1Ref = useMemo(() => {
    if (!storeId || !ymd) return null;
    return doc(db, "stores", storeId, "temperatureLogs", ymd, "checks", "log1");
  }, [storeId, ymd]);

  const log2Ref = useMemo(() => {
    if (!storeId || !ymd) return null;
    return doc(db, "stores", storeId, "temperatureLogs", ymd, "checks", "log2");
  }, [storeId, ymd]);

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }
  }, [storeId, nav]);

  useEffect(() => {
    if (!dayRef || !log1Ref || !log2Ref) return;

    setLoading(true);

    const unsubs = [];

    unsubs.push(
      onSnapshot(
        dayRef,
        (snap) => {
          setDay(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        },
        (err) => console.error("dayRef:", err)
      )
    );

    unsubs.push(
      onSnapshot(
        log1Ref,
        (snap) => {
          setLog1(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        },
        (err) => console.error("log1Ref:", err)
      )
    );

    unsubs.push(
      onSnapshot(
        log2Ref,
        (snap) => {
          setLog2(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        },
        (err) => console.error("log2Ref:", err)
      )
    );

    // small delay to avoid flicker, optional
    const t = setTimeout(() => setLoading(false), 200);

    return () => {
      clearTimeout(t);
      unsubs.forEach((u) => u && u());
    };
  }, [dayRef, log1Ref, log2Ref]);

  function logStatus(checkDoc) {
    if (!checkDoc) return "NOT DONE";
    if (checkDoc?.hasOutOfRange) return "ALERT";
    return "OK";
  }

  function logStatusKind(checkDoc) {
    if (!checkDoc) return "PENDING";
    if (checkDoc?.hasOutOfRange) return "ALERT";
    return "OK";
  }

  const checkCount = Number(day?.checkCount || 0);
  const dayBadgeText = checkCount < 2 ? `PENDING (${checkCount}/2)` : (day?.hasOutOfRange ? "ALERT" : "OK");
  const dayBadgeKind = checkCount < 2 ? "PENDING" : (day?.hasOutOfRange ? "ALERT" : "OK");

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 900 }}>Temperature Day: {ymd}</div>
        <button className="btn" onClick={() => nav("/admin/temperature")}>Back</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="muted">
          Store: <b>{storeId}</b>
        </div>

        {loading ? (
          <div className="muted" style={{ marginTop: 10 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Day status:</div>
              <span className={pillClass(dayBadgeKind)}>{dayBadgeText}</span>

              {day?.lastCheckAt ? (
                <span className="meta">
                  Last check: <b>{formatTs(day.lastCheckAt)}</b>
                </span>
              ) : null}
            </div>

            {day?.updatedByName ? (
              <div className="meta" style={{ marginTop: 6 }}>
                Updated by: <b>{day.updatedByName}</b>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 900 }}>Open a check:</div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            className="btn primary"
            onClick={() => nav(`/admin/temperature/${ymd}/log1`)}
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            Log 1
            <span className={pillClass(logStatusKind(log1))}>{logStatus(log1)}</span>
          </button>

          <button
            className="btn primary"
            onClick={() => nav(`/admin/temperature/${ymd}/log2`)}
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            Log 2
            <span className={pillClass(logStatusKind(log2))}>{logStatus(log2)}</span>
          </button>
        </div>

        <div className="meta" style={{ marginTop: 10 }}>
          Tip: Day becomes <b>OK</b> only when both logs are completed (2/2) and no alert.
        </div>
      </div>
    </div>
  );
}
