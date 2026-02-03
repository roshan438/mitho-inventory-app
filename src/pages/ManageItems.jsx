import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";

const UNIT_OPTIONS = ["kg", "packet", "bottle", "piece", "cup", "portion", "litre"];

export default function ManageItems() {
  const nav = useNavigate();
  const { storeId } = useStore();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  // add form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("piece");
  const [threshold, setThreshold] = useState("2");

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editUnit, setEditUnit] = useState("piece");
  const [editThreshold, setEditThreshold] = useState("2");
  const [editActive, setEditActive] = useState(true);

  const [msg, setMsg] = useState("");

  // basic role guard (UI-side)
  useEffect(() => {
    if (profile && profile.role !== "admin") nav("/employee");
  }, [profile, nav]);

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    (async () => {
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, "stores", storeId, "items"), orderBy("sortOrder", "asc"))
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(list);
      setLoading(false);
    })();
  }, [storeId, nav]);

  const activeItems = useMemo(() => items.filter((i) => i.isActive !== false), [items]);
  const inactiveItems = useMemo(() => items.filter((i) => i.isActive === false), [items]);

  async function refresh() {
    const snap = await getDocs(
      query(collection(db, "stores", storeId, "items"), orderBy("sortOrder", "asc"))
    );
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function addItem() {
    setMsg("");

    const n = name.trim();
    const t = Number(threshold);

    if (!n) return setMsg("Item name required.");
    if (Number.isNaN(t) || t < 0) return setMsg("Threshold must be a number (0 or more).");

    try {
      const ref = await addDoc(collection(db, "stores", storeId, "items"), {
        name: n,
        category: "custom",
        defaultUnit: unit,
        lowStockThreshold: t,
        isActive: true,
        sortOrder: (items.length + 1) * 10,
        updatedAt: serverTimestamp(),
      });

      setName("");
      setUnit("piece");
      setThreshold("2");
      setMsg("Added ✅");
      await refresh();

      // optional: auto open edit
      setEditingId(ref.id);
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Add failed");
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditUnit(item.defaultUnit || "piece");
    setEditThreshold(String(item.lowStockThreshold ?? 2));
    setEditActive(item.isActive !== false);
    setMsg("");
  }

  async function saveEdit() {
    if (!editingId) return;
    setMsg("");

    const t = Number(editThreshold);
    if (Number.isNaN(t) || t < 0) return setMsg("Threshold must be a number (0 or more).");

    try {
      await updateDoc(doc(db, "stores", storeId, "items", editingId), {
        defaultUnit: editUnit,
        lowStockThreshold: t,
        isActive: !!editActive,
        updatedAt: serverTimestamp(),
      });

      setMsg("Saved ✅");
      setEditingId(null);
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Save failed");
    }
  }

  async function disableItem(id) {
    setMsg("");
    try {
      await updateDoc(doc(db, "stores", storeId, "items", id), {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
      setMsg("Disabled ✅");
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Disable failed");
    }
  }

  async function enableItem(id) {
    setMsg("");
    try {
      await updateDoc(doc(db, "stores", storeId, "items", id), {
        isActive: true,
        updatedAt: serverTimestamp(),
      });
      setMsg("Enabled ✅");
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Enable failed");
    }
  }

  async function deleteItemForever(id) {
    setMsg("");
    const yes = window.confirm("Delete permanently? This cannot be undone.");
    if (!yes) return;

    try {
      await deleteDoc(doc(db, "stores", storeId, "items", id));
      setMsg("Deleted ✅");
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Delete failed");
    }
  }

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 700 }}>Manage Items</div>
        <button className="btn" onClick={() => nav("/admin")}>Back</button>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800 }}>Add new item</div>

        <label className="label">Item name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New item name" />

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Unit</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div style={{ width: 140 }}>
            <label className="label">Low stock ≤</label>
            <input
              className="input"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="numeric"
              placeholder="2"
            />
          </div>
        </div>

        <button className="btn primary" onClick={addItem}>Add Item</button>

        {msg ? <div className="muted">{msg}</div> : null}
      </div>

      {loading ? (
        <div className="muted" style={{ marginTop: 12 }}>Loading items…</div>
      ) : (
        <>
          <h3 style={{ marginTop: 16 }}>Active items ({activeItems.length})</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeItems.map((it) => (
              <div key={it.id} className="card" style={{ gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>{it.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {it.defaultUnit || "-"} • low ≤ {it.lowStockThreshold ?? "-"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={() => startEdit(it)}>Edit</button>
                  <button className="btn" onClick={() => disableItem(it.id)}>Disable</button>
                  <button className="btn" onClick={() => deleteItemForever(it.id)}>Delete</button>
                </div>

                {editingId === it.id ? (
                  <div className="card" style={{ background: "#fff" }}>
                    <div style={{ fontWeight: 800 }}>Edit: {it.name}</div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label className="label">Unit</label>
                        <select className="input" value={editUnit} onChange={(e) => setEditUnit(e.target.value)}>
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ width: 140 }}>
                        <label className="label">Low stock ≤</label>
                        <input
                          className="input"
                          value={editThreshold}
                          onChange={(e) => setEditThreshold(e.target.value)}
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                      Active
                    </label>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn primary" onClick={saveEdit}>Save</button>
                      <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 16 }}>Disabled items ({inactiveItems.length})</h3>

          {inactiveItems.length === 0 ? (
            <div className="muted">No disabled items.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {inactiveItems.map((it) => (
                <div key={it.id} className="card" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{it.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {it.defaultUnit || "-"} • low ≤ {it.lowStockThreshold ?? "-"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn" onClick={() => enableItem(it.id)}>Enable</button>
                    <button className="btn" onClick={() => deleteItemForever(it.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
