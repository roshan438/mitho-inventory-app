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
import EmployeeTopBar from "../components/EmployeeTopBar";
import SideMenu from "../components/SideMenu";
import ConfirmModal from "../components/ConfirmModal";

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeTempInput(raw) {
  let x = String(raw ?? "");

  // allow empty
  if (x === "") return "";

  // comma -> dot
  x = x.replace(",", ".");

  // keep digits, dot, minus
  x = x.replace(/[^0-9.\-]/g, "");

  // only one leading "-"
  if (x.includes("-")) {
    x = x.replace(/-/g, "");
    x = "-" + x;
  }

  // only one dot
  const parts = x.split(".");
  if (parts.length > 2) x = parts[0] + "." + parts.slice(1).join("");

  return x;
}

/** ✅ Range rules:
 * - If Firestore equipment config has {min,max}, use it
 * - Else auto detect by label/id:
 *   freezer: -25..-15
 *   fridge/cooler: 0..5
 * - Else default: 0..5
 */
function getRangeForEquipment(eq) {
  if (typeof eq?.min === "number" && typeof eq?.max === "number") {
    return { min: eq.min, max: eq.max, source: "custom" };
  }

  const txt = `${eq?.label || ""} ${eq?.id || ""}`.toLowerCase();

  if (txt.includes("freezer")) return { min: -25, max: -15, source: "auto-freezer" };
  if (txt.includes("cooler") || txt.includes("fridge"))
    return { min: 0, max: 5, source: "auto-fridge" };

  return { min: 0, max: 5, source: "default" };
}

function getTempWarning(eq, rawTemp) {
  const raw = String(rawTemp ?? "").trim();
  if (!raw) return null;

  const n = Number(raw.replace(",", "."));
  if (Number.isNaN(n)) return "Enter a valid number";

  const { min, max } = getRangeForEquipment(eq);

  if (n < min) return `Too cold ⚠️ (Safe range: ${min} to ${max} °C)`;
  if (n > max) return `Too warm ⚠️ (Safe range: ${min} to ${max} °C)`;

  return null;
}

export default function TemperatureLogEmployee() {
  const nav = useNavigate();
  const { profile, logout } = useAuth();
  const { storeId } = useStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  const [equipmentList, setEquipmentList] = useState([]);
  const [values, setValues] = useState({}); // { fridge1: { temp:"", note:"" } }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);

  const {storeName } = useCurrentStoreName();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState({
    title: "",
    message: "",
    confirmText: "OK",
  });

  const ymd = todayYMD();

  const logDocRef = storeId
    ? collection(
      db,
      "stores",
      storeId,
      "temperatureLogs",
      ymd,
      "entries"
    )
    
    : null;

  // ✅ Load equipment config (stores/{storeId}.temperatureEquipment)
  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);
    setMsg("");

    const storeRef = doc(db, "stores", storeId);
    const unsub = onSnapshot(
      storeRef,
      (snap) => {
        const data = snap.data() || {};
        const list = Array.isArray(data.temperatureEquipment)
          ? data.temperatureEquipment
          : [];

        // fallback if not configured
        const fallback = [
          { id: "fridge1", label: "Fridge 1", min: 0, max: 5 },
          { id: "fridge2", label: "Fridge 2", min: 0, max: 5 },
          { id: "freezer", label: "Freezer", min: -25, max: -15 },
          { id: "cooler", label: "Cooler Box", min: 0, max: 5 },
        ];

        const finalList = list.length ? list : fallback;
        setEquipmentList(finalList);

        // init values for new equipment ids
        setValues((prev) => {
          const next = { ...prev };
          for (const eq of finalList) {
            if (!next[eq.id]) next[eq.id] = { temp: "", note: "" };
          }
          return next;
        });

        setLoading(false);
      },
      (err) => {
        console.error(err);
        setMsg(err?.message || "Failed to load store equipment.");
        setTimeout(() => setMsg(""), 2500);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId, nav]);

  // ✅ Live today doc (prefill)
  useEffect(() => {
    if (!logDocRef) return;

    const unsub = onSnapshot(logDocRef, (snap) => {
      if (!snap.exists()) {
        setHasSubmittedToday(false);
        return;
      }

      const data = snap.data() || {};
      setHasSubmittedToday(true);

      // Prefill only if user isn't typing
      if (!dirty && data?.equipment) {
        setValues((prev) => {
          const next = { ...prev };
          for (const [eqId, v] of Object.entries(data.equipment)) {
            next[eqId] = {
              temp: v?.temp === 0 ? "0" : String(v?.temp ?? ""),
              note: String(v?.note ?? ""),
            };
          }
          return next;
        });
      }
    });

    return () => unsub();
  }, [logDocRef, dirty]);

  const canSubmit = useMemo(() => {
    if (!equipmentList.length) return false;

    for (const eq of equipmentList) {
      const raw = values[eq.id]?.temp ?? "";
      if (raw === "") return false;
      const n = Number(String(raw).replace(",", "."));
      if (Number.isNaN(n)) return false;
    }
    return true;
  }, [equipmentList, values]);

  // ✅ Out-of-range detector (for info / future blocking rules)
  const hasOutOfRange = useMemo(() => {
    for (const eq of equipmentList) {
      const warn = getTempWarning(eq, values[eq.id]?.temp);
      // treat "Enter a valid number" separately (canSubmit already covers it)
      if (warn && warn !== "Enter a valid number") return true;
    }
    return false;
  }, [equipmentList, values]);

  async function reallySave() {
    if (!storeId || !logDocRef) return;

    setSaving(true);
    setMsg("");

    try {
      // build payload
      const equipmentPayload = {};
      let anyOutOfRange = false;

      for (const eq of equipmentList) {
        const raw = values[eq.id]?.temp ?? "";
        const note = values[eq.id]?.note ?? "";
        const tempNum = Number(String(raw).replace(",", "."));

        const range = getRangeForEquipment(eq);
        const outOfRange = tempNum < range.min || tempNum > range.max;
        if (outOfRange) anyOutOfRange = true;

        equipmentPayload[eq.id] = {
          label: eq.label || eq.id,
          temp: tempNum,
          unit: "°C",
          note: String(note || ""),
          min: range.min,
          max: range.max,
          outOfRange,
        };
      }

      const existing = await getDoc(logDocRef);
      const isEdit = existing.exists();

      const batch = writeBatch(db);

      if (!isEdit) {
        batch.set(
          logDocRef,
          {
            submittedAt: serverTimestamp(),
            submittedDate: ymd,
            submittedByEmployeeId: profile?.employeeId || "unknown",
            submittedByName: profile?.name || profile?.employeeId || "Employee",

            lastEditedAt: null,
            lastEditedByEmployeeId: null,
            lastEditedByName: null,

            isReadByAdmin: false,
            needsAdminReview: false,

            equipment: equipmentPayload,
            hasOutOfRange: anyOutOfRange,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        batch.set(
          logDocRef,
          {
            lastEditedAt: serverTimestamp(),
            lastEditedByEmployeeId: profile?.employeeId || "unknown",
            lastEditedByName: profile?.name || profile?.employeeId || "Employee",

            isReadByAdmin: false,
            needsAdminReview: true,

            equipment: equipmentPayload,
            hasOutOfRange: anyOutOfRange,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();

      // add revision doc when edit
      if (isEdit) {
        await addDoc(
          collection(db, "stores", storeId, "temperatureLogs", ymd, "revisions"),
          {
            editedAt: serverTimestamp(),
            editedByEmployeeId: profile?.employeeId || "unknown",
            editedByName: profile?.name || profile?.employeeId || "Employee",
            equipment: equipmentPayload,
            hasOutOfRange: anyOutOfRange,
          }
        );
      }

      setDirty(false);

      if (anyOutOfRange) {
        setMsg(
          isEdit
            ? "Updated ✅ (⚠️ Some temperatures are out of range. Admin will review.)"
            : "Saved ✅ (⚠️ Some temperatures are out of range. Admin will review.)"
        );
        setTimeout(() => setMsg(""), 2500);
      } else {
        setMsg(isEdit ? "Updated ✅ Admin will review changes." : "Saved ✅ Temperature log recorded.");
        setTimeout(() => setMsg(""), 2500);
      }
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Save failed.");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function saveWithConfirm() {
    setMsg("");

    if (!canSubmit) {
      setMsg("Please enter temperature for all equipment.");
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    const isEditMode = hasSubmittedToday;

    setConfirmData({
      title: isEditMode ? "Update temperature log?" : "Save temperature log?",
      message: isEditMode
        ? "You’re updating today’s temperatures. Admin will see who edited."
        : "Save today’s temperature record now?",
      confirmText: isEditMode ? "Update" : "Save",
    });

    setConfirmOpen(true);
  }

  return (
    <div className="page">
     <div style={{ 
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center', 
  padding: '10px 0' 
}}>
  {/* Left side: Text group */}
  <div>
    <div style={{ fontWeight: 900, fontSize: '24px', lineHeight: '1.2' }}>
      Temperature Log
    </div>
    <div style={{ color: '#666', fontSize: '14px' }}>
      Store: <span style={{ fontWeight: 700 }}><b>{storeName || storeId || "—"}</b></span>
    </div>
  </div>

  {/* Right side: Button */}
  <button 
    className="btn" 
    onClick={() => nav(profile?.role === "admin" ? "/admin" : "/employee")}
    style={{ padding: '8px 16px' }}
  >
    Back
  </button>
</div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 900 }}>
              {hasSubmittedToday ? "Today saved ✅ (Edit mode)" : "Not saved yet"}
            </div>
            <div className="muted" style={{ margin: 0 }}>
              {profile?.name || profile?.employeeId} • {ymd}
            </div>
          </div>
        </div>

        <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Enter temperatures in °C (decimals allowed, e.g. 3.5 or -18.2).
        </div>

        {hasOutOfRange ? (
          <div
            style={{
              marginTop: 10,
              color: "#b00020",
              fontWeight: 900,
              fontSize: 13,
              background: "rgba(176,0,32,.08)",
              border: "1px solid rgba(176,0,32,.20)",
              padding: "8px 10px",
              borderRadius: 12,
            }}
          >
            ⚠️ One or more temperatures are out of the safe range. Please double-check.
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : equipmentList.length === 0 ? (
        <div className="muted">No equipment configured for this store.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {equipmentList.map((eq) => {
            const warn = getTempWarning(eq, values[eq.id]?.temp);

            return (
              <div key={eq.id} className="card" style={{ gap: 10 }}>
                <div
                  style={{
                    fontWeight: 900,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span>{eq.label || eq.id}</span>
                  {warn && warn !== "Enter a valid number" ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "rgba(176,0,32,.10)",
                        border: "1px solid rgba(176,0,32,.20)",
                        color: "#b00020",
                      }}
                    >
                      ⚠️ OUT OF RANGE
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    className="input"
                    style={{
                      width: 140,
                      textAlign: "center",
                      fontWeight: 900,
                      border: warn ? "1px solid rgba(176,0,32,.35)" : undefined,
                    }}
                    type="text"
                    inputMode="decimal"
                    step="any"
                    placeholder="e.g. -18.5"
                    value={values[eq.id]?.temp ?? ""}
                    onChange={(e) => {
                      setDirty(true);
                      const v = normalizeTempInput(e.target.value);
                      setValues((prev) => ({
                        ...prev,
                        [eq.id]: { ...(prev[eq.id] || {}), temp: v },
                      }));
                    }}
                  />
                  <div style={{ fontWeight: 900 }}>°C</div>
                </div>

                {warn ? (
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
                ) : null}

                <input
                  className="input"
                  placeholder="Note (optional)"
                  value={values[eq.id]?.note ?? ""}
                  onChange={(e) => {
                    setDirty(true);
                    setValues((prev) => ({
                      ...prev,
                      [eq.id]: { ...(prev[eq.id] || {}), note: e.target.value },
                    }));
                  }}
                />

                {/* Optional: show the range used (small hint) */}
                <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>
                  Safe range: {getRangeForEquipment(eq).min} to {getRangeForEquipment(eq).max} °C
                </div>
              </div>
            );
          })}
        </div>
      )}

{msg ? (
  <div className={`toast ${msg.toLowerCase().includes("fail") ? "danger" : "success"}`}>
    <span className="toastTxt">{msg}</span>
  </div>
) : null}

      <button
        className="btn primary"
        style={{ position: "fixed", left: 16, right: 16, bottom: 16 }}
        disabled={!canSubmit || saving}
        onClick={saveWithConfirm}
      >
        {saving ? "Saving…" : hasSubmittedToday ? "Update Today’s Temperature" : "Save Temperature Log"}
      </button>

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAllItems={() => {
          setMenuOpen(false);
          nav("/all-items");
        }}
        onTempLog={() => {
          setMenuOpen(false);
          nav("/employee/temperature");
        }}
        onSwitchStore={() => {
          setMenuOpen(false);
          nav("/stores");
        }}
        onLogout={async () => {
          setMenuOpen(false);
          await logout();
          nav("/");
        }}
      />

      <ConfirmModal
        open={confirmOpen}
        title={confirmData.title}
        message={confirmData.message}
        confirmText={confirmData.confirmText}
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
