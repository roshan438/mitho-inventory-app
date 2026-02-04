import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";

function normNameToEmail(name) {
  const clean = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")          // remove spaces
    .replace(/[^a-z0-9]/g, "");   // keep safe chars only
  return clean ? `${clean}@mithomitho.com.au` : "";
}

function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ""));
}

export default function ManageEmployees() {
  const nav = useNavigate();
  const { storeId } = useStore(); // current selected store (optional use)

  const [stores, setStores] = useState([]); // from /stores
  const [employees, setEmployees] = useState([]); // from /users where role=employee

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

    // Link UID tool
    const [linkEmail, setLinkEmail] = useState("");
    const [linkUid, setLinkUid] = useState("");
    const [linking, setLinking] = useState(false);
  

  // Create employee form
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [assignStoreId, setAssignStoreId] = useState("");
  const [saving, setSaving] = useState(false);

  // Load stores (live)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "stores"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.isActive !== false)
        .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

      setStores(list);

      // default store selection
      setAssignStoreId((prev) => prev || storeId || list[0]?.id || "");
    });

    return () => unsub();
  }, [storeId]);

  // Load employees (live)
  useEffect(() => {
    setLoading(true);
    const qRef = query(collection(db, "users"), where("role", "==", "employee"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        setEmployees(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setMsg(err?.message || "Failed to load employees.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const emailPreview = useMemo(() => normNameToEmail(name), [name]);

  async function createEmployeeProfileOnly() {
    setMsg("");

    const employeeName = String(name || "").trim();
    const employeeEmail = normNameToEmail(employeeName);

    if (!employeeName) return setMsg("Enter employee name.");
    if (!employeeEmail) return setMsg("Name invalid for email.");
    if (!isValidPin(pin)) return setMsg("PIN must be 4 digits.");
    if (!assignStoreId) return setMsg("Select a store.");

    setSaving(true);
    try {
      // IMPORTANT: without Cloud Functions, we cannot create Auth users from app.
      // So we create a Firestore profile doc under a placeholder doc id:
      // We will use employeeEmail as doc id under `employeesByEmail/` to avoid needing UID now.
      //
      // Then admin creates Auth user manually and links UID later.

      await setDoc(
        doc(db, "employeesByEmail", employeeEmail),
        {
          role: "employee",
          name: employeeName,
          email: employeeEmail,
          pin, // MVP: plain pin (later we hash)
          active: true,
          storeIds: [assignStoreId],
          defaultStoreId: assignStoreId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          linkedUid: null, // admin will fill after creating Auth user
        },
        { merge: true }
      );

      setMsg(
        `Created profile ✅ Now create Firebase Auth user with email: ${employeeEmail} and password = PIN, then paste UID into linkedUid.`
      );

      setName("");
      setPin("");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  async function updateEmployee(uid, patch) {
    setMsg("");
    try {
      await updateDoc(doc(db, "users", uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      setMsg("Updated ✅");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Update failed.");
    }
  }

  async function toggleActive(uid, next) {
    await updateEmployee(uid, { active: next });
  }

  async function savePin(uid, nextPin) {
    if (!isValidPin(nextPin)) {
      setMsg("PIN must be 4 digits.");
      return;
    }
    await updateEmployee(uid, { pin: String(nextPin) });
    setMsg("PIN updated ✅ (Remember: also change Auth password manually if you use PIN as password)");
  }

  async function toggleStore(uid, targetStoreId) {
    const emp = employees.find((e) => e.uid === uid);
    if (!emp) return;

    const current = Array.isArray(emp.storeIds) ? emp.storeIds : [];
    const has = current.includes(targetStoreId);
    const next = has ? current.filter((x) => x !== targetStoreId) : [...current, targetStoreId];

    if (next.length === 0) {
      setMsg("Employee must have at least 1 store.");
      return;
    }

    await updateEmployee(uid, {
      storeIds: next,
      defaultStoreId: emp.defaultStoreId && next.includes(emp.defaultStoreId) ? emp.defaultStoreId : next[0],
    });
  }

  async function linkUidToEmployee() {
    setMsg("");

    const email = String(linkEmail || "").trim().toLowerCase();
    const uid = String(linkUid || "").trim();

    if (!email) return setMsg("Enter employee email to link.");
    if (!uid) return setMsg("Paste Firebase Auth UID.");

    setLinking(true);
    try {
      // read draft
      const draftRef = doc(db, "employeesByEmail", email);
      const draftSnap = await getDoc(draftRef);

      if (!draftSnap.exists()) {
        setMsg("No draft profile found for this email. Create profile first.");
        setLinking(false);
        return;
      }

      const d = draftSnap.data();

      // write real profile to users/{uid}
      await setDoc(
        doc(db, "users", uid),
        {
          role: "employee",
          name: d.name || "",
          email: d.email || email,
          pin: d.pin || "",
          active: d.active !== false,
          storeIds: Array.isArray(d.storeIds) && d.storeIds.length ? d.storeIds : [],
          defaultStoreId:
            d.defaultStoreId ||
            (Array.isArray(d.storeIds) && d.storeIds.length ? d.storeIds[0] : null),
          linkedFromDraftEmail: email,
          updatedAt: serverTimestamp(),
          createdAt: d.createdAt || serverTimestamp(),
        },
        { merge: true }
      );

      // mark draft linked
      await updateDoc(draftRef, {
        linkedUid: uid,
        linkedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMsg("Linked ✅ Employee can now log in.");
      setLinkEmail("");
      setLinkUid("");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Link failed.");
    } finally {
      setLinking(false);
    }
  }


  return (
    <div className="page">
      <div className="navbar">
        <button className="btn" onClick={() => nav(-1)}>Back</button>
        <div style={{ fontWeight: 900 }}>Manage Employees</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Create employee (profile only) */}
      <div className="card">
        <div style={{ fontWeight: 900 }}>Create employee (profile)</div>
        <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
          This creates a Firestore profile entry. You will still create the Auth user manually in Firebase Console.
        </div>

        <label className="label">Employee name</label>
        <input
          className="input"
          placeholder="e.g. Shiv Raj"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Email will be: <b>{emailPreview || "—"}</b>
        </div>

        <label className="label" style={{ marginTop: 10 }}>4-digit PIN (also set same as Auth password)</label>
        <input
          className="input"
          inputMode="numeric"
          placeholder="1234"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        <label className="label" style={{ marginTop: 10 }}>Assign store</label>
        <select
          className="input"
          value={assignStoreId}
          onChange={(e) => setAssignStoreId(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.id}
            </option>
          ))}
        </select>

        <button
          className="btn primary"
          style={{ marginTop: 10 }}
          disabled={saving}
          onClick={createEmployeeProfileOnly}
        >
          {saving ? "Saving…" : "Create Employee Profile"}
        </button>

        <div className="card" style={{ marginTop: 12, background: "rgba(0,0,0,.02)" }}>
          <div style={{ fontWeight: 900 }}>Manual Auth steps (after creating profile)</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            1) Firebase Console → Authentication → Users → Add user <br />
            2) Email = <b>employeename@mithomitho.com.au</b> (auto from name) <br />
            3) Password = <b>same 4-digit PIN</b> (for your PIN login) <br />
            4) Copy UID → create Firestore doc: <b>users/UID</b> with role + storeIds + pin <br />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, background: "rgba(0,0,0,.02)" }}>
        <div style={{ fontWeight: 900 }}>Link Auth UID (finish setup)</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          After you create the user in Firebase Auth manually, paste UID here to create <b>users/UID</b>.
        </div>

        <label className="label" style={{ marginTop: 8 }}>Employee email</label>
        <input
          className="input"
          placeholder="e.g. shivraj@mithomitho.com.au"
          value={linkEmail}
          onChange={(e) => setLinkEmail(e.target.value)}
        />

        <label className="label" style={{ marginTop: 8 }}>Firebase Auth UID</label>
        <input
          className="input"
          placeholder="Paste UID from Firebase Auth"
          value={linkUid}
          onChange={(e) => setLinkUid(e.target.value)}
        />

        <button
          className="btn primary"
          style={{ marginTop: 10 }}
          disabled={linking}
          onClick={linkUidToEmployee}
        >
          {linking ? "Linking…" : "Link UID"}
        </button>
      </div>


        {msg ? <div className="muted" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>

      <div style={{ marginTop: 14, fontWeight: 900 }}>Existing employees (users collection)</div>

      {loading ? (
        <div className="muted" style={{ marginTop: 10 }}>Loading…</div>
      ) : employees.length === 0 ? (
        <div className="muted" style={{ marginTop: 10 }}>No employees yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {employees.map((e) => (
            <div key={e.uid} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: "60%" }}>
                  <div style={{ fontWeight: 900 }}>{e.name || e.employeeId || "Employee"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    UID: <b>{e.uid}</b>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Email: <b>{e.email || "—"}</b>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {e.active === false ? <span className="badge red">DISABLED</span> : <span className="badge green">ACTIVE</span>}
                  <button className="btn" onClick={() => toggleActive(e.uid, e.active === false)}>
                    {e.active === false ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Stores</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {stores.map((s) => {
                    const has = Array.isArray(e.storeIds) && e.storeIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        className={`btn ${has ? "primary" : ""}`}
                        onClick={() => toggleStore(e.uid, s.id)}
                        style={{ padding: "10px 12px" }}
                      >
                        {s.name || s.id}
                      </button>
                    );
                  })}
                </div>

                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Tap a store to add/remove. Must keep at least 1 store.
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label className="label">Update PIN (4 digits)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    defaultValue={e.pin || ""}
                    placeholder="1234"
                    inputMode="numeric"
                    style={{ flex: 1 }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") savePin(e.uid, ev.currentTarget.value);
                    }}
                  />
                  <button
                    className="btn"
                    onClick={(ev) => {
                      const input = ev.currentTarget.parentElement.querySelector("input");
                      savePin(e.uid, input.value);
                    }}
                  >
                    Save
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  If PIN = Auth password, also change password in Firebase Auth manually.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
