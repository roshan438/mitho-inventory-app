import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  getDoc,
  writeBatch,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import useCurrentStoreName from "../hooks/useCurrentStoreName";
import ConfirmModal from "../components/ConfirmModal";

function todayYMD() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/* ---------------- RANGE LOGIC ---------------- */

function getRangeForEquipment(eq) {
  if (typeof eq?.min === "number" && typeof eq?.max === "number") {
    return { min: eq.min, max: eq.max };
  }

  const txt = `${eq?.label || ""} ${eq?.id || ""}`.toLowerCase();

  if (txt.includes("freezer")) return { min: -25, max: -15 };
  if (txt.includes("cooler") || txt.includes("fridge"))
    return { min: 0, max: 5 };

  return { min: 0, max: 5 };
}

/* ---------------- AUTO NEGATIVE FIX ---------------- */

function autoFixNegative(eq, rawValue) {
  if (rawValue === "") return "";

  const { min } = getRangeForEquipment(eq);

  // If freezer (negative range)
  if (typeof min === "number" && min < 0) {
    let clean = String(rawValue).replace(/-/g, "");

    if (clean !== "") {
      return "-" + clean;
    }
  }

  return rawValue;
}

function getTempWarning(eq, rawTemp) {
  const raw = String(rawTemp ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  if (Number.isNaN(n)) return "Enter valid number";

  const { min, max } = getRangeForEquipment(eq);

  if (n < min) return `Too cold ⚠️ (Safe: ${min} to ${max}°C)`;
  if (n > max) return `Too warm ⚠️ (Safe: ${min} to ${max}°C)`;

  return null;
}

/* ================================================= */

export default function TemperatureLogEmployee() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { storeId } = useStore();
  const { storeName } = useCurrentStoreName();

  const [equipmentList, setEquipmentList] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ymd = todayYMD();
  const logDocRef = storeId
    ? doc(db, "stores", storeId, "temperatureLogs", ymd)
    : null;

  /* ---------- Load Equipment ---------- */

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    const storeRef = doc(db, "stores", storeId);

    const unsub = onSnapshot(storeRef, (snap) => {
      const data = snap.data() || {};
      const list = Array.isArray(data.temperatureEquipment)
        ? data.temperatureEquipment
        : [];

      setEquipmentList(list);

      setValues((prev) => {
        const next = { ...prev };
        for (const eq of list) {
          if (!next[eq.id]) next[eq.id] = { temp: "", note: "" };
        }
        return next;
      });

      setLoading(false);
    });

    return () => unsub();
  }, [storeId, nav]);

  /* ---------- Submit Logic ---------- */

  const canSubmit = useMemo(() => {
    if (!equipmentList.length) return false;

    for (const eq of equipmentList) {
      const raw = values[eq.id]?.temp ?? "";
      if (raw === "") return false;
      if (Number.isNaN(Number(raw))) return false;
    }

    return true;
  }, [equipmentList, values]);

  async function reallySave() {
    if (!logDocRef) return;

    setSaving(true);

    try {
      const equipmentPayload = {};
      let anyOut = false;

      for (const eq of equipmentList) {
        const raw = values[eq.id]?.temp ?? "";
        const tempNum = Number(raw);
        const range = getRangeForEquipment(eq);

        const outOfRange =
          tempNum < range.min || tempNum > range.max;

        if (outOfRange) anyOut = true;

        equipmentPayload[eq.id] = {
          label: eq.label,
          temp: tempNum,
          unit: "°C",
          min: range.min,
          max: range.max,
          outOfRange,
        };
      }

      await writeBatch(db)
        .set(
          logDocRef,
          {
            submittedAt: serverTimestamp(),
            submittedDate: ymd,
            submittedByName:
              profile?.name || profile?.employeeId || "Employee",
            equipment: equipmentPayload,
            hasOutOfRange: anyOut,
            updatedAt: serverTimestamp(),
            isReadByAdmin: false,
          },
          { merge: true }
        )
        .commit();

      setMsg(anyOut ? "Saved ⚠️ Admin will review." : "Saved ✅");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setMsg("Save failed ❌");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setSaving(false);
    }
  }

  /* ================================================= */

  return (
    <div className="page">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 24 }}>
          Temperature Log
        </div>
        <div className="muted">
          Store: <b>{storeName || storeId}</b>
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {equipmentList.map((eq) => {
            const warn = getTempWarning(eq, values[eq.id]?.temp);

            return (
              <div key={eq.id} className="card">
                <div style={{ fontWeight: 900 }}>{eq.label}</div>

                <div className="muted" style={{ fontSize: 12 }}>
                  Safe range: {getRangeForEquipment(eq).min} to{" "}
                  {getRangeForEquipment(eq).max} °C
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder="e.g. -18.5"
                    value={values[eq.id]?.temp ?? ""}
                    onChange={(e) => {
                      let v = e.target.value;

                      // 🔥 AUTO NEGATIVE FOR FREEZER
                      v = autoFixNegative(eq, v);

                      setValues((prev) => ({
                        ...prev,
                        [eq.id]: {
                          ...(prev[eq.id] || {}),
                          temp: v,
                        },
                      }));
                    }}
                  />
                  <div style={{ fontWeight: 900 }}>°C</div>
                </div>

                {warn && (
                  <div
                    style={{
                      color: "#b00020",
                      fontWeight: 900,
                      fontSize: 13,
                      background: "rgba(176,0,32,.08)",
                      border: "1px solid rgba(176,0,32,.20)",
                      padding: "8px 10px",
                      borderRadius: 12,
                    }}
                  >
                    {warn}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {msg && <div className="toast success">{msg}</div>}

      <button
        className="btn primary"
        style={{ position: "fixed", left: 16, right: 16, bottom: 16 }}
        disabled={!canSubmit || saving}
        onClick={() => setConfirmOpen(true)}
      >
        {saving ? "Saving…" : "Save Temperature Log"}
      </button>

      <ConfirmModal
        open={confirmOpen}
        title="Save temperature log?"
        message="Confirm saving today's temperature readings."
        confirmText="Save"
        cancelText="Cancel"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false);
          await reallySave();
        }}
      />
    </div>
  );
}
