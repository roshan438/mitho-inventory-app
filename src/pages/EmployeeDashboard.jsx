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

import ConfirmModal from "../components/ConfirmModal";


import EmployeeTopBar from "../components/EmployeeTopBar";
import SideMenu from "../components/SideMenu";

const UNIT_OPTIONS = ["kg", "packet", "bottle", "piece", "cup", "portion", "litre"];

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function calcStatus(qty, threshold) {
  if (qty === 0) return "out_of_stock";
  if (typeof threshold === "number" && qty <= threshold) return "need_stock";
  return "in_stock";
}

function statusBadge(status) {
  if (status === "out_of_stock") return { text: "OUT", cls: "badge red" };
  if (status === "need_stock") return { text: "LOW", cls: "badge orange" };
  if (status === "in_stock") return { text: "OK", cls: "badge green" };
  return null;
}

export default function EmployeeDashboard() {
  const nav = useNavigate();
  const { profile, logout } = useAuth();
  const { storeId } = useStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [dirty, setDirty] = useState(false);


  const [items, setItems] = useState([]);
  const [values, setValues] = useState({}); // itemId -> { quantity, unit }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState({
    title: "",
    message: "",
    confirmText: "OK",
  });

  // daily submission state
  const [todaySubmission, setTodaySubmission] = useState(null);
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);

  // ✅ Sorting: prevent jump while typing
  const [sortVersion, setSortVersion] = useState(0);

  const ymd = todayYMD();
  const submissionDocRef = storeId
    ? doc(db, "stores", storeId, "stockSubmissions", ymd)
    : null;

  // ✅ Live items list
  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);
    setMsg("");

    const unsub = onSnapshot(collection(db, "stores", storeId, "items"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

      setItems(list);

      // init values without wiping current inputs
      setValues((prev) => {
        const next = { ...prev };
        for (const it of list) {
          if (!next[it.id]) {
            next[it.id] = { quantity: "", unit: it.defaultUnit || "piece" };
          } else {
            next[it.id] = {
              quantity: next[it.id].quantity ?? "",
              unit: next[it.id].unit ?? (it.defaultUnit || "piece"),
            };
          }
        }
        return next;
      });

      setLoading(false);
    });

    return () => unsub();
  }, [storeId, nav]);

  // ✅ Live “today submission” (single doc per day)
  useEffect(() => {
    if (!submissionDocRef) return;

    const unsub = onSnapshot(submissionDocRef, (snap) => {
      if (!snap.exists()) {
        setTodaySubmission(null);
        setHasSubmittedToday(false);
        return;
      }

      const data = snap.data();
      setTodaySubmission({ id: snap.id, ...data });
      setHasSubmittedToday(true);

      // Prefill ONLY when user is not currently typing/editing
if (!dirty && data?.items) {
    setValues((prev) => {
      const next = { ...prev };
      for (const [itemId, v] of Object.entries(data.items)) {
        next[itemId] = {
          // keep as string for input field
          quantity: v?.quantity === 0 ? "0" : String(v?.quantity ?? ""),
          unit: v?.unit ?? next[itemId]?.unit ?? "piece",
        };
      }
      return next;
    });
  }
  
    });

    return () => unsub();
}, [submissionDocRef, dirty]);


  const computed = useMemo(() => {
    const out = {};
    for (const it of items) {
      const raw = values[it.id]?.quantity ?? "";
      const unit = values[it.id]?.unit ?? it.defaultUnit ?? "piece";
      const qty = raw === "" ? null : Number(raw);

      out[it.id] = {
        qty,
        unit,
        status:
          qty === null || Number.isNaN(qty)
            ? null
            : calcStatus(qty, it.lowStockThreshold),
      };
    }
    return out;
  }, [items, values]);

  // ✅ Progress tracker
  const progress = useMemo(() => {
    const total = items.length;
    let done = 0;
    for (const it of items) {
      const q = computed[it.id]?.qty;
      if (q !== null && !Number.isNaN(q) && q >= 0) done++;
    }
    return {
      total,
      done,
      missing: Math.max(0, total - done),
      percent: total ? Math.round((done / total) * 100) : 0,
    };
  }, [items, computed]);

  const canSubmit = useMemo(() => {
    if (!items.length) return false;
    for (const it of items) {
      const q = computed[it.id]?.qty;
      if (q === null || Number.isNaN(q) || q < 0) return false;
    }
    return true;
  }, [items, computed]);

  // ✅ Search + sorting (but sorting only updates on blur via sortVersion)
  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = !s
      ? items
      : items.filter((it) => it.name.toLowerCase().includes(s));

    const rank = (it) => {
      const status = computed[it.id]?.status;
      if (status == null) return 0; // not entered first
      if (status === "out_of_stock") return 1;
      if (status === "need_stock") return 2;
      if (status === "in_stock") return 3;
      return 9;
    };

    return [...base].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [items, search, sortVersion]); // ✅ no jump typing

  async function reallySubmitOrUpdate() {
    if (!storeId || !submissionDocRef) return;
  
    setSaving(true);
    setMsg("");
  
    try {
            // compute submission payload
            let lowCount = 0;
            let outCount = 0;
            const submissionItems = {};
      
            for (const it of items) {
              const c = computed[it.id];
              const status = c.status || "in_stock";
      
              submissionItems[it.id] = {
                quantity: c.qty,
                unit: c.unit,
                status,
              };
      
              if (status === "out_of_stock") outCount++;
              if (status === "need_stock") lowCount++;
            }
      
            // check existence for race safety
            const existing = await getDoc(submissionDocRef);
            const existsNow = existing.exists();
            const finalIsEdit = existsNow; // if already exists, treat as edit
      
            const batch = writeBatch(db);
      
            // update currentStock live
            for (const it of items) {
              const c = computed[it.id];
              const status = c.status || "in_stock";
      
              const stockRef = doc(db, "stores", storeId, "currentStock", it.id);
              batch.set(
                stockRef,
                {
                  quantity: c.qty,
                  unit: c.unit,
                  status,
                  updatedAt: serverTimestamp(),
                  updatedByEmployeeId: profile?.employeeId || "unknown",
                  updatedByName: profile?.name || profile?.employeeId || "Employee",
                },
                { merge: true }
              );
            }
      
            if (!finalIsEdit) {
              // first submit of day
              batch.set(
                submissionDocRef,
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
      
                  lowOutSummary: { lowCount, outCount },
                  items: submissionItems,
                },
                { merge: true }
              );
            } else {
              // edit existing
              batch.set(
                submissionDocRef,
                {
                  lastEditedAt: serverTimestamp(),
                  lastEditedByEmployeeId: profile?.employeeId || "unknown",
                  lastEditedByName: profile?.name || profile?.employeeId || "Employee",
      
                  // force admin to see the change
                  isReadByAdmin: false,
                  needsAdminReview: true,
      
                  lowOutSummary: { lowCount, outCount },
                  items: submissionItems,
                },
                { merge: true }
              );
            }
      
            await batch.commit();

            if (finalIsEdit) {
            await addDoc(
                collection(db, "stores", storeId, "stockSubmissions", ymd, "revisions"),
                {
                editedAt: serverTimestamp(),
                editedByEmployeeId: profile?.employeeId || "unknown",
                editedByName: profile?.name || profile?.employeeId || "Employee",
                items: submissionItems,
                lowOutSummary: { lowCount, outCount },
                }
            );
            }

        setDirty(false);
        setMsg(finalIsEdit ? "Updated ✅ Admin will review changes." : "Submitted ✅ End of shift saved.");
        } catch (e) {
        console.error(e);
        setMsg(e?.message || "Save failed.");
        } finally {
        setSaving(false);
        }
    }

  async function submitOrUpdateShift() {
    setMsg("");
  
    if (!canSubmit) {
      setMsg("Please fill all quantities before submitting.");
      return;
    }
  
    const isEditMode = hasSubmittedToday;
  
    // ✅ Set modal text depending on Submit or Update
    setConfirmData({
      title: isEditMode ? "Update submission?" : "Submit end of shift?",
      message: isEditMode
        ? "You’re updating today’s stock. Admin will see who edited."
        : "Submit today’s end-of-shift stock count now?",
      confirmText: isEditMode ? "Update" : "Submit",
    });
  
    // ✅ open modal
    setConfirmOpen(true);
  }
  

  return (
    <div className="page">
      <EmployeeTopBar title="End-of-shift Stock" onMenu={() => setMenuOpen(true)} />

      {/* Header + Progress + Search */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900 }}>
              {hasSubmittedToday ? "Today submitted ✅ (Edit mode)" : "Not submitted yet"}
            </div>
            <div className="muted" style={{ margin: 0 }}>
              {profile?.name || profile?.employeeId} • {ymd}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 900 }}>{progress.done}/{progress.total}</div>
            <div className="muted" style={{ margin: 0, fontSize: 13 }}>
              {progress.missing} missing • {progress.percent}%
            </div>
          </div>
        </div>

        <label className="label" style={{ marginTop: 10 }}>Search item</label>
        <input
          className="input"
          placeholder="Type to search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="muted">Loading items…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredItems.map((it) => {
            const v = values[it.id];
            const c = computed[it.id];
            const b = statusBadge(c?.status);

            return (
              <div
                key={it.id}
                className="card"
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: "55%" }}>
                  <div style={{ fontWeight: 900 }}>{it.name}</div>
                  {b ? (
                    <div className={b.cls} style={{ marginTop: 6 }}>{b.text}</div>
                  ) : (
                    <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                      Enter qty
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="input"
                    style={{ width: 90, textAlign: "center" }}
                    placeholder="0"
                    inputMode="numeric"
                    value={v?.quantity ?? ""}
                    onChange={(e) => {
                        setDirty(true);
                        setValues((prev) => ({
                          ...prev,
                          [it.id]: { ...prev[it.id], quantity: e.target.value },
                        }));
                      }}
                      
                    // ✅ only re-sort after they finish editing (prevents page jump)
                    onBlur={() => setSortVersion((x) => x + 1)}
                  />

                  <select
                    className="input"
                    style={{ width: 120 }}
                    value={v?.unit ?? it.defaultUnit ?? "piece"}
                    onChange={(e) => {
                        setDirty(true);
                        setValues((prev) => ({
                          ...prev,
                          [it.id]: { ...prev[it.id], unit: e.target.value },
                        }));
                        setSortVersion((x) => x + 1);
                      }}
                      
                  >
                    {it.defaultUnit && !UNIT_OPTIONS.includes(it.defaultUnit) ? (
                      <option value={it.defaultUnit}>{it.defaultUnit}</option>
                    ) : null}
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {msg ? <div className="muted" style={{ marginTop: 12 }}>{msg}</div> : null}

      <button
        className="btn primary"
        style={{ position: "fixed", left: 16, right: 16, bottom: 16 }}
        disabled={!canSubmit || saving}
        onClick={submitOrUpdateShift}
      >
        {saving ? "Saving…" : hasSubmittedToday ? "Update Today’s Stock" : "Submit End of Shift"}
      </button>

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAllItems={() => { setMenuOpen(false); nav("/all-items"); }}
        onSwitchStore={() => { setMenuOpen(false); nav("/stores"); }}
        onLogout={async () => { setMenuOpen(false); await logout(); nav("/"); }}
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
    await reallySubmitOrUpdate();
  }}
/>

    </div>
  );
}
