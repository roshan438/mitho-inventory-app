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
  const [openCats, setOpenCats] = useState(() => ({})); // { categoryName: boolean }

  const [items, setItems] = useState([]);
  const [values, setValues] = useState({}); // itemId -> { quantity, unit }

  const [currentStockMap, setCurrentStockMap] = useState({}); // itemId -> { quantity, unit }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState({
    title: "",
    message: "",
    confirmText: "OK",
  });

  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);

  // prevent jump typing
  const [sortVersion, setSortVersion] = useState(0);

  const ymd = todayYMD();
  const submissionDocRef = storeId
    ? doc(db, "stores", storeId, "stockSubmissions", ymd)
    : null;

  // ✅ step +/- always 1
  function stepQty(itemId, delta) {
    setDirty(true);
    setValues((prev) => {
      const curRaw = prev[itemId]?.quantity ?? "";
      const cur = curRaw === "" ? 0 : Number(String(curRaw).replace(",", "."));
      const next = Math.max(0, (Number.isNaN(cur) ? 0 : cur) + delta);
      return {
        ...prev,
        [itemId]: { ...prev[itemId], quantity: String(next) },
      };
    });
    setSortVersion((x) => x + 1);
  }

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

  // ✅ NEW: Live latest currentStock (this is what we use for tomorrow defaults)
  useEffect(() => {
    if (!storeId) return;

    const unsub = onSnapshot(
      collection(db, "stores", storeId, "currentStock"),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data(); // {quantity, unit, ...}
        });
        setCurrentStockMap(map);
      },
      (err) => {
        console.error(err);
      }
    );

    return () => unsub();
  }, [storeId]);

  // ✅ Live “today submission”
  useEffect(() => {
    if (!submissionDocRef) return;

    const unsub = onSnapshot(submissionDocRef, (snap) => {
      if (!snap.exists()) {
        setHasSubmittedToday(false);
        return;
      }

      const data = snap.data();
      setHasSubmittedToday(true);

      // prefill only when not editing
      if (!dirty && data?.items) {
        setValues((prev) => {
          const next = { ...prev };
          for (const [itemId, v] of Object.entries(data.items)) {
            next[itemId] = {
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

  // ✅ NEW: If today is NOT submitted yet, prefill from currentStock
  useEffect(() => {
    if (!items.length) return;
    if (dirty) return; // never overwrite while typing
    if (hasSubmittedToday) return; // today submission already controls the UI

    // Prefill from currentStock only if the input is empty
    setValues((prev) => {
      const next = { ...prev };

      for (const it of items) {
        const existingQty = next[it.id]?.quantity ?? "";
        const existingUnit = next[it.id]?.unit ?? it.defaultUnit ?? "piece";

        // only fill if empty (so we don't override something)
        if (existingQty === "") {
          const cs = currentStockMap[it.id];
          if (cs && cs.quantity !== undefined && cs.quantity !== null) {
            next[it.id] = {
              quantity: cs.quantity === 0 ? "0" : String(cs.quantity),
              unit: cs.unit || existingUnit,
            };
          } else {
            // if no stock record, keep blank quantity but ensure unit
            next[it.id] = { quantity: "", unit: existingUnit };
          }
        } else {
          // keep existing typed value, but keep unit stable
          next[it.id] = { quantity: existingQty, unit: existingUnit };
        }
      }

      return next;
    });
  }, [items, currentStockMap, dirty, hasSubmittedToday]);

  const computed = useMemo(() => {
    const out = {};
    for (const it of items) {
      const raw = values[it.id]?.quantity ?? "";
      const unit = values[it.id]?.unit ?? it.defaultUnit ?? "piece";
      const qty = raw === "" ? null : Number(String(raw).replace(",", "."));

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

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = !s ? items : items.filter((it) => it.name.toLowerCase().includes(s));

    const rank = (it) => {
      const status = computed[it.id]?.status;
      if (status == null) return 0;
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
  }, [items, search, sortVersion, computed]);

  const grouped = useMemo(() => {
    const map = new Map();

    const list = filteredItems.map((it) => ({
      ...it,
      category: it.category || "Uncategorized",
      categoryOrder: typeof it.categoryOrder === "number" ? it.categoryOrder : 999,
    }));

    for (const it of list) {
      const key = it.category;
      if (!map.has(key)) map.set(key, { name: key, order: it.categoryOrder, items: [] });
      map.get(key).items.push(it);
    }

    for (const g of map.values()) {
      g.items.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [filteredItems]);

  async function reallySubmitOrUpdate() {
    if (!storeId || !submissionDocRef) return;

    setSaving(true);
    setMsg("");

    try {
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

      const existing = await getDoc(submissionDocRef);
      const finalIsEdit = existing.exists();

      const batch = writeBatch(db);

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
        batch.set(
          submissionDocRef,
          {
            lastEditedAt: serverTimestamp(),
            lastEditedByEmployeeId: profile?.employeeId || "unknown",
            lastEditedByName: profile?.name || profile?.employeeId || "Employee",

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
      setTimeout(() => setMsg(""), 2000);

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
      setTimeout(() => setMsg(""), 2500);
      return;
    }

    const isEditMode = hasSubmittedToday;

    setConfirmData({
      title: isEditMode ? "Update submission?" : "Submit end of shift?",
      message: isEditMode
        ? "You’re updating today’s stock. Admin will see who edited."
        : "Submit today’s end-of-shift stock count now?",
      confirmText: isEditMode ? "Update" : "Submit",
    });

    setConfirmOpen(true);
  }

  return (
    <div className="page">
      <EmployeeTopBar title="End-of-shift Stock" onMenu={() => setMenuOpen(true)} />

      {/* Header */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="empHeaderRow">
          <div>
            <div style={{ fontWeight: 900 }}>
              {hasSubmittedToday ? "Today submitted ✅ (Edit mode)" : "Not submitted yet"}
            </div>
            <div className="muted" style={{ margin: 0 }}>
              {profile?.name || profile?.employeeId} • {ymd}
            </div>
            {!hasSubmittedToday ? (
              <div className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                Prefilled from latest stock ✅ (edit only what changed)
              </div>
            ) : null}
          </div>

          <div className="empHeaderRight">
            <div className="empHeaderBig">{progress.done}/{progress.total}</div>
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

      {/* Categories */}
      {loading ? (
        <div className="muted">Loading items…</div>
      ) : (
        <div className="empList">
          {grouped.map((group) => {
            const isOpen = !!openCats[group.name];

            return (
              <div key={group.name} className="card category-card">
                <button
                  className="category-header"
                  onClick={() => setOpenCats((prev) => ({ ...prev, [group.name]: !isOpen }))}
                >
                  <span>
                    {group.name} <span className="category-count">({group.items.length})</span>
                  </span>
                  <span className="category-arrow">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div className="category-items">
                    {group.items.map((it) => {
                      const v = values[it.id];
                      const c = computed[it.id];
                      const b = statusBadge(c?.status);

                      return (
                        <div key={it.id} className="item-row">
                          {/* LEFT */}
                          <div className="item-left">
                            <div className="item-name">{it.name}</div>
                            {b ? (
                              <div className={b.cls}>{b.text}</div>
                            ) : (
                              <div className="muted" style={{ fontSize: 13 }}>Enter qty</div>
                            )}
                          </div>

                          {/* RIGHT */}
                          <div className="item-right">
                            <button
                              type="button"
                              className="iconBtn"
                              onClick={() => stepQty(it.id, -1)}
                            >
                              −
                            </button>

                            <input
                              className="qtyBox"
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={v?.quantity ?? ""}
                              onChange={(e) => {
                                let x = e.target.value;
                                x = x.replace(",", ".");
                                x = x.replace(/[^0-9.]/g, "");
                                const parts = x.split(".");
                                if (parts.length > 2) x = parts[0] + "." + parts.slice(1).join("");

                                setDirty(true);
                                setValues((prev) => ({
                                  ...prev,
                                  [it.id]: { ...prev[it.id], quantity: x },
                                }));
                              }}
                              onBlur={() => setSortVersion((x) => x + 1)}
                            />

                            <button
                              type="button"
                              className="iconBtn"
                              onClick={() => stepQty(it.id, +1)}
                            >
                              +
                            </button>

                            <select
                              className="unitSelect"
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
        className="btn primary empSubmitBtn"
        // disabled={!canSubmit || saving}
        onClick={submitOrUpdateShift}
      >
        {saving ? "Saving…" : hasSubmittedToday ? "Update Today’s Stock" : "Submit End of Shift"}
      </button>

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAllItems={() => { setMenuOpen(false); nav("/all-items"); }}
        onTempLog={() => { setMenuOpen(false); nav("/employee/temperature"); }}
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
