import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

function cleanId(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

export default function ManageStores() {
  const nav = useNavigate();

  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  const [storeName, setStoreName] = useState("");
  const [storeIdInput, setStoreIdInput] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, "stores"),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) =>
            String(a.name || a.storeName || a.id).localeCompare(
              String(b.name || b.storeName || b.id)
            )
          );
        setStores(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
        setMsg(err?.message || "Failed to load stores.");
      }
    );

    return () => unsub();
  }, []);

  const suggestedId = useMemo(() => cleanId(storeName), [storeName]);

  async function createStore() {
    setMsg("");
    const storeId = cleanId(storeIdInput || suggestedId);
    const name = String(storeName || "").trim();

    if (!name) {
      setMsg("Enter store name.");
      return;
    }
    if (!storeId) {
      setMsg("Store ID is required (letters/numbers/_/- only).");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "stores", storeId),
        {
          name,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStoreName("");
      setStoreIdInput("");
      setMsg("Store created ✅");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(storeId, next) {
    setMsg("");
    try {
      await updateDoc(doc(db, "stores", storeId), {
        isActive: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Update failed.");
    }
  }

  async function renameStore(storeId, nextName) {
    setMsg("");
    const name = String(nextName || "").trim();
    if (!name) {
      setMsg("Name cannot be empty.");
      return;
    }
    try {
      await updateDoc(doc(db, "stores", storeId), {
        name,
        updatedAt: serverTimestamp(),
      });
      setMsg("Updated ✅");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Update failed.");
    }
  }

  return (
    <div className="page">
      <div className="navbar">
        <button className="btn" onClick={() => nav(-1)}>
          Back
        </button>
        <div style={{ fontWeight: 900 }}>Manage Stores</div>
        <div style={{ width: 60 }} />
      </div>

      <div className="card">
        <div style={{ fontWeight: 900 }}>Create a store</div>

        <label className="label">Store name</label>
        <input
          className="input"
          placeholder="e.g. Mitho Mitho"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
        />

        <label className="label">Store ID (used internally)</label>
        <input
          className="input"
          placeholder={suggestedId || "e.g. mitho_mitho"}
          value={storeIdInput}
          onChange={(e) => setStoreIdInput(e.target.value)}
        />
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Tip: leave blank to auto-generate: <b>{suggestedId || "—"}</b>
        </div>

        <button
          className="btn primary"
          style={{ marginTop: 10 }}
          onClick={createStore}
          disabled={saving}
        >
          {saving ? "Creating…" : "Create Store"}
        </button>

        {msg ? <div className="muted" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>

      <div style={{ marginTop: 12, fontWeight: 900 }}>All stores</div>

      {loading ? (
        <div className="muted" style={{ marginTop: 10 }}>
          Loading…
        </div>
      ) : stores.length === 0 ? (
        <div className="muted" style={{ marginTop: 10 }}>
          No stores yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {stores.map((s) => (
            <div key={s.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: "60%" }}>
                  <div style={{ fontWeight: 900 }}>
                    {s.name || s.storeName || s.id}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    ID: <b>{s.id}</b>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {s.isActive === false ? (
                    <span className="badge red">INACTIVE</span>
                  ) : (
                    <span className="badge green">ACTIVE</span>
                  )}

                  <button
                    className="btn"
                    onClick={() => toggleActive(s.id, !(s.isActive !== false))}
                  >
                    {s.isActive === false ? "Activate" : "Disable"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                <label className="label">Rename store</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    defaultValue={s.name || ""}
                    placeholder="Store name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renameStore(s.id, e.currentTarget.value);
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn"
                    onClick={(e) => {
                      const input = e.currentTarget.parentElement.querySelector("input");
                      renameStore(s.id, input.value);
                    }}
                  >
                    Save
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  (Press Enter to save)
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
