// src/pages/TemperatureLogAdminDay.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
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

function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function TemperatureLogAdminDay() {
  const nav = useNavigate();
  const { ymd } = useParams();
  const { profile } = useAuth();
  const { storeId } = useStore();

  const [loading, setLoading] = useState(true);
  const [storeEquip, setStoreEquip] = useState([]);
  const [log, setLog] = useState(null);

  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && profile.role !== "admin") nav("/employee");
  }, [profile, nav]);

  const storeRef = useMemo(() => (storeId ? doc(db, "stores", storeId) : null), [storeId]);
  const logRef = useMemo(() => (storeId && ymd ? doc(db, "stores", storeId, "temperatureLogs", ymd) : null), [storeId, ymd]);

  useEffect(() => {
    if (!storeRef) return;
    const unsub = onSnapshot(storeRef, (snap) => {
      const data = snap.data() || {};
      setStoreEquip(Array.isArray(data.temperatureEquipment) ? data.temperatureEquipment : []);
    });
    return () => unsub();
  }, [storeRef]);

  useEffect(() => {
    if (!logRef) return;
    setLoading(true);

    const unsub = onSnapshot(
      logRef,
      async (snap) => {
        if (!snap.exists()) {
          setLog(null);
          setEdit({});
          setLoading(false);
          return;
        }

        const data = snap.data() || {};
        setLog({ id: snap.id, ...data });

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

        try {
          if (data?.isReadByAdmin === false) {
            await updateDoc(logRef, { isReadByAdmin: true, adminReadAt: serverTimestamp() });
          }
        } catch {}
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [logRef]);

  const equipmentEntries = useMemo(() => {
    const equipment = log?.equipment || {};
    const cfgMap = new Map((storeEquip || []).map((e) => [e.id, e]));
    const entries = [];

    for (const [eqId, v] of Object.entries(equipment)) {
      const cfg = cfgMap.get(eqId);
      const label = v?.label || cfg?.label || eqId;
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
  }, [log, edit, storeEquip]);

  const hasOutOfRange = equipmentEntries.some((e) => e.outOfRange);

  function exportDayCSV() {
    if (!log) return;

    const rows = [];
    rows.push(["date", "equipmentId", "equipmentLabel", "tempC", "min", "max", "outOfRange", "note"].join(","));

    for (const e of equipmentEntries) {
      const temp = (edit[e.id]?.temp ?? "").replace(",", ".");
      const note = String(edit[e.id]?.note ?? "").replaceAll('"', '""');

      rows.push([
        log.submittedDate || log.id,
        e.id,
        `"${String(e.label).replaceAll('"', '""')}"`,
        temp,
        e.range.min,
        e.range.max,
        e.outOfRange ? "YES" : "NO",
        `"${note}"`,
      ].join(","));
    }

    downloadCSV(`temperature_${storeId}_${ymd}.csv`, rows.join("\n"));
  }

  async function saveAdminUpdate() {
    if (!logRef || !log) return;
    setMsg("");
    setSaving(true);
  
    try {
      const equipmentPayload = {};
      let nextHasOutOfRange = false;
  
      for (const e of equipmentEntries) {
        const raw = edit[e.id]?.temp ?? "";
        const note = edit[e.id]?.note ?? "";
        const tempNum = Number(String(raw).replace(",", "."));
  
        const isNum = Number.isFinite(tempNum);
        const out =
          isNum ? (tempNum < e.range.min || tempNum > e.range.max) : false;
  
        if (out) nextHasOutOfRange = true;
  
        equipmentPayload[e.id] = {
          label: e.label,
          temp: isNum ? tempNum : null,
          unit: "°C",
          note: String(note || ""),
          // ✅ persist range + outOfRange so dashboard can show it
          min: e.range.min,
          max: e.range.max,
          outOfRange: out,
        };
      }
  
      // build a config map for ranges (from store doc)
const cfgMap = new Map((storeEquip || []).map((e) => [e.id, e]));

// compute outOfRange for each equipment and overall
let anyOut = false;

for (const [eqId, v] of Object.entries(equipmentPayload)) {
  const cfg = cfgMap.get(eqId);
  const label = v.label || eqId;

  const min = typeof cfg?.min === "number" ? cfg.min : inferRangeFromLabel(label).min;
  const max = typeof cfg?.max === "number" ? cfg.max : inferRangeFromLabel(label).max;

  const t = typeof v.temp === "number" ? v.temp : null;
  const out = t === null ? false : (t < min || t > max);

  equipmentPayload[eqId] = {
    ...equipmentPayload[eqId],
    min,
    max,
    outOfRange: out,
  };

  if (out) anyOut = true;
}

await updateDoc(logRef, {
  equipment: equipmentPayload,
  hasOutOfRange: anyOut,          // ✅ important
  needsAdminReview: false,
  isReadByAdmin: true,
  adminUpdatedAt: serverTimestamp(),
  adminUpdatedBy: profile?.name || profile?.employeeId || "Admin",
  updatedAt: serverTimestamp(),
});

  
      setMsg("Saved ✅");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }
  
  function tempStatus(e, edit) {
    const raw = edit[e.id]?.temp;
    const temp = Number(String(raw ?? "").replace(",", "."));
  
    if (!Number.isFinite(temp)) return "OK";
  
    if (temp > e.range.max) return "HIGH";
    if (temp < e.range.min) return "LOW";
  
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
        <div style={{ fontWeight: 900 }}>Temperature: {ymd}</div>
        <button className="btn" onClick={() => nav("/admin/temperature")}>Back</button>
      </div>

      {loading ? (
        <div className="muted" style={{ marginTop: 12 }}>Loading…</div>
      ) : !log ? (
        <div className="muted" style={{ marginTop: 12 }}>No log found for {ymd}.</div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  By: {log.submittedByName || log.submittedByEmployeeId || "-"}
                </div>
                <div className="meta">
                  {log.lastEditedAt
                    ? `Edited by: ${log.lastEditedByName || log.lastEditedByEmployeeId || "-"}`
                    : "No edits"}
                  {log.needsAdminReview ? " • Needs review" : ""}
                </div>
              </div>

              <button className="btn" onClick={exportDayCSV}>Export CSV</button>
            </div>

            {hasOutOfRange ? (
              <div className="warnBanner" style={{ marginTop: 10 }}>
                ⚠️ Warning: Some temperatures are out of range.
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 10 }}>All temperatures look OK ✅</div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {equipmentEntries.map((e) => (
              <div key={e.id} className={`eqCard ${e.outOfRange ? "alert" : ""}`}>
                <div className="eqTop">
                  <div style={{ fontWeight: 900 }}>{e.label}</div>
                  
{(() => {
  const status = tempStatus(e, edit);
  return (
    <div className={tempBadgeClass(status)}>
      {status}
    </div>
  );
})()}

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
            ))}
          </div>

          {msg ? <div className="muted" style={{ marginTop: 12 }}>{msg}</div> : null}

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
