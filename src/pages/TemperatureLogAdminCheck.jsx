// src/pages/TemperatureLogAdminCheck.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

function inferRangeFromLabel(label = "") {
  const s = String(label).toLowerCase();
  if (s.includes("freezer")) return { min: -25, max: -15 };
  return { min: 0, max: 5 };
}

function normalizeTempInput(raw) {
  let x = String(raw ?? "");
  if (x === "") return "";
  x = x.replace(",", ".");
  x = x.replace(/[^0-9.\-]/g, "");
  if (x.includes("-")) {
    x = x.replace(/-/g, "");
    x = "-" + x;
  }
  const parts = x.split(".");
  if (parts.length > 2) x = parts[0] + "." + parts.slice(1).join("");
  return x;
}

// ✅ recompute DAY doc from log1+log2
async function recomputeAndUpdateDay({ storeId, ymd, updatedByName }) {
  const dayRef = doc(db, "stores", storeId, "temperatureLogs", ymd);
  const log1Ref = doc(db, "stores", storeId, "temperatureLogs", ymd, "checks", "log1");
  const log2Ref = doc(db, "stores", storeId, "temperatureLogs", ymd, "checks", "log2");

  const [d1, d2] = await Promise.all([getDoc(log1Ref), getDoc(log2Ref)]);

  const exists1 = d1.exists();
  const exists2 = d2.exists();

  const c1 = exists1 ? d1.data() : null;
  const c2 = exists2 ? d2.data() : null;

  const checkCount = (exists1 ? 1 : 0) + (exists2 ? 1 : 0);

  // ✅ day hasOutOfRange if ANY check hasOutOfRange
  const hasOutOfRange = Boolean(c1?.hasOutOfRange) || Boolean(c2?.hasOutOfRange);

  // lastCheckAt: use checkAt if present else updatedAt/adminUpdatedAt
  const ts1 = c1?.checkAt || c1?.updatedAt || c1?.adminUpdatedAt || null;
  const ts2 = c2?.checkAt || c2?.updatedAt || c2?.adminUpdatedAt || null;

  // pick latest timestamp (Firestore Timestamp compare using toMillis)
  const pickLatest = (a, b) => {
    if (!a) return b || null;
    if (!b) return a || null;
    const am = a?.toMillis?.() ? a.toMillis() : new Date(a).getTime();
    const bm = b?.toMillis?.() ? b.toMillis() : new Date(b).getTime();
    return am >= bm ? a : b;
  };

  const lastCheckAt = pickLatest(ts1, ts2);

  await updateDoc(dayRef, {
    submittedDate: ymd,
    checkCount,
    hasOutOfRange,
    lastCheckAt: lastCheckAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByName: updatedByName || "Admin",
    // optional: admin read/review fields
    isReadByAdmin: true,
    needsAdminReview: false,
  });
}

export default function TemperatureLogAdminCheck() {
  const nav = useNavigate();
  const { ymd, slot } = useParams(); // slot = log1 or log2
  const { profile } = useAuth();
  const { storeId } = useStore();

  const [loading, setLoading] = useState(true);
  const [storeEquip, setStoreEquip] = useState([]);
  const [check, setCheck] = useState(null);

  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && profile.role !== "admin") nav("/employee");
  }, [profile, nav]);

  const storeRef = useMemo(
    () => (storeId ? doc(db, "stores", storeId) : null),
    [storeId]
  );

  const checkRef = useMemo(() => {
    if (!storeId || !ymd || !slot) return null;
    return doc(db, "stores", storeId, "temperatureLogs", ymd, "checks", slot);
  }, [storeId, ymd, slot]);

  useEffect(() => {
    if (!storeRef) return;
    const unsub = onSnapshot(storeRef, (snap) => {
      const data = snap.data() || {};
      setStoreEquip(Array.isArray(data.temperatureEquipment) ? data.temperatureEquipment : []);
    });
    return () => unsub();
  }, [storeRef]);

  useEffect(() => {
    if (!checkRef) return;
    setLoading(true);

    const unsub = onSnapshot(
      checkRef,
      (snap) => {
        if (!snap.exists()) {
          setCheck(null);
          setEdit({});
          setLoading(false);
          return;
        }

        const data = snap.data() || {};
        setCheck({ id: snap.id, ...data });

        const next = {};
        const equipment = data?.equipment || {};
        for (const [eqId, v] of Object.entries(equipment)) {
          next[eqId] = {
            temp: v?.temp === 0 ? "0" : String(v?.temp ?? ""),
            note: String(v?.note ?? ""),
          };
        }
        setEdit(next);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [checkRef]);

  const equipmentEntries = useMemo(() => {
    const cfgMap = new Map((storeEquip || []).map((e) => [e.id, e]));
    const allIds = new Set([
      ...Object.keys(check?.equipment || {}),
      ...storeEquip.map((x) => x.id),
    ]);

    const entries = [];
    for (const eqId of allIds) {
      const cfg = cfgMap.get(eqId);
      const label = cfg?.label || eqId;
      const range = {
        min: typeof cfg?.min === "number" ? cfg.min : inferRangeFromLabel(label).min,
        max: typeof cfg?.max === "number" ? cfg.max : inferRangeFromLabel(label).max,
      };

      const tempNum = Number(String(edit[eqId]?.temp ?? "").replace(",", "."));
      const outOfRange = Number.isFinite(tempNum) ? (tempNum < range.min || tempNum > range.max) : false;

      entries.push({ id: eqId, label, range, outOfRange });
    }

    entries.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return entries;
  }, [check, edit, storeEquip]);

  const hasOutOfRange = equipmentEntries.some((e) => e.outOfRange);

  async function saveAdminUpdate() {
    if (!checkRef || !storeId || !ymd) return;
    setSaving(true);
    setMsg("");

    try {
      const cfgMap = new Map((storeEquip || []).map((e) => [e.id, e]));
      const equipmentPayload = {};
      let anyOut = false;

      for (const e of equipmentEntries) {
        const raw = edit[e.id]?.temp ?? "";
        const note = edit[e.id]?.note ?? "";
        const tempNum = Number(String(raw).replace(",", "."));
        const isNum = Number.isFinite(tempNum);

        const cfg = cfgMap.get(e.id);
        const min = typeof cfg?.min === "number" ? cfg.min : e.range.min;
        const max = typeof cfg?.max === "number" ? cfg.max : e.range.max;

        const out = isNum ? (tempNum < min || tempNum > max) : false;
        if (out) anyOut = true;

        equipmentPayload[e.id] = {
          label: e.label,
          temp: isNum ? tempNum : null,
          unit: "°C",
          note: String(note || ""),
          min,
          max,
          outOfRange: out,
        };
      }

      // ✅ 1) update check doc
      await updateDoc(checkRef, {
        equipment: equipmentPayload,
        hasOutOfRange: anyOut,
        adminUpdatedAt: serverTimestamp(),
        adminUpdatedBy: profile?.name || profile?.employeeId || "Admin",
        updatedAt: serverTimestamp(),
      });

      // ✅ 2) recompute + update DAY doc (fixes your problem)
      await recomputeAndUpdateDay({
        storeId,
        ymd,
        updatedByName: profile?.name || profile?.employeeId || "Admin",
      });

      setMsg("Saved ✅");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Save failed ❌");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setSaving(false);
    }
  }

  function tempStatus(e) {
    const raw = edit[e.id]?.temp;
    const t = Number(String(raw ?? "").replace(",", "."));
    if (!Number.isFinite(t)) return "OK";
    if (t > e.range.max) return "HIGH";
    if (t < e.range.min) return "LOW";
    return "OK";
  }

  function tempBadgeClass(status) {
    if (status === "HIGH") return "badge red";
    if (status === "LOW") return "badge blue";
    return "badge green";
  }

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 900 }}>
          {ymd} • {String(slot).toUpperCase()}
        </div>
        <button className="btn" onClick={() => nav(`/admin/temperature/${ymd}`)}>Back</button>
      </div>

      {loading ? (
        <div className="muted" style={{ marginTop: 12 }}>Loading…</div>
      ) : !check ? (
        <div className="muted" style={{ marginTop: 12 }}>
          No {slot} check found for {ymd}.
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            {hasOutOfRange ? (
              <div className="warnBanner">⚠️ Warning: Some temperatures are out of range.</div>
            ) : (
              <div className="muted">All temperatures look OK ✅</div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {equipmentEntries.map((e) => {
              const status = tempStatus(e);
              return (
                <div key={e.id} className={`eqCard ${e.outOfRange ? "alert" : ""}`}>
                  <div className="eqTop">
                    <div style={{ fontWeight: 900 }}>{e.label}</div>
                    <div className={tempBadgeClass(status)}>{status}</div>
                  </div>

                  <div className="rangeText">
                    Safe range: {e.range.min} to {e.range.max} °C
                  </div>

                  <div className="tempRow">
                    <input
                      className="input tempBox"
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 3.5"
                      value={edit[e.id]?.temp ?? ""}
                      onChange={(ev) => {
                        const v = normalizeTempInput(ev.target.value);
                        setEdit((p) => ({ ...p, [e.id]: { ...(p[e.id] || {}), temp: v } }));
                      }}
                    />
                    <div style={{ fontWeight: 900 }}>°C</div>
                  </div>

                  <input
                    className="input"
                    placeholder="Note (optional)"
                    value={edit[e.id]?.note ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setEdit((p) => ({ ...p, [e.id]: { ...(p[e.id] || {}), note: v } }));
                    }}
                  />
                </div>
              );
            })}
          </div>

          {msg ? (
            <div className={`toast ${msg.toLowerCase().includes("fail") ? "danger" : "success"}`}>
              <span className="toastTxt">{msg}</span>
            </div>
          ) : null}

          <button
            className="btn primary"
            style={{ position: "fixed", left: 16, right: 16, bottom: 16 }}
            disabled={saving}
            onClick={saveAdminUpdate}
          >
            {saving ? "Saving…" : "Save Admin Update"}
          </button>

          <div style={{ height: 92 }} />
        </>
      )}
    </div>
  );
}
