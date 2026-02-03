import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";

function fmtTs(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString();
}

function badgeText(status) {
  if (status === "out_of_stock") return "OUT";
  if (status === "need_stock") return "LOW";
  if (status === "in_stock") return "OK";
  return "—";
}

function badgeClass(status) {
  if (status === "out_of_stock") return "badge red";
  if (status === "need_stock") return "badge orange";
  if (status === "in_stock") return "badge green";
  return "badge";
}

export default function AdminSubmissionDetail() {
  const nav = useNavigate();
  const { storeId } = useStore();
  const { dayId } = useParams(); // YYYY-MM-DD

  const [sub, setSub] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [itemsMap, setItemsMap] = useState(new Map());
  const [msg, setMsg] = useState("");
  const [showOk, setShowOk] = useState(false);

  const subRef = useMemo(() => {
    if (!storeId || !dayId) return null;
    return doc(db, "stores", storeId, "stockSubmissions", dayId);
  }, [storeId, dayId]);

  // Load items map once (itemId -> item data)
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const snap = await getDocs(collection(db, "stores", storeId, "items"));
      const map = new Map(snap.docs.map((d) => [d.id, d.data()]));
      setItemsMap(map);
    })();
  }, [storeId]);

  // Live submission
  useEffect(() => {
    if (!subRef) return;

    const unsub = onSnapshot(subRef, (snap) => {
      if (!snap.exists()) {
        setSub(null);
        return;
      }
      setSub({ id: snap.id, ...snap.data() });
    });

    return () => unsub();
  }, [subRef]);

  // Live revisions
  useEffect(() => {
    if (!storeId || !dayId) return;

    const qRef = query(
      collection(db, "stores", storeId, "stockSubmissions", dayId, "revisions"),
      orderBy("editedAt", "desc")
    );

    const unsub = onSnapshot(qRef, (snap) => {
      setRevisions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [storeId, dayId]);

  const rows = useMemo(() => {
    if (!sub?.items) return [];

    const out = [];
    for (const [itemId, v] of Object.entries(sub.items)) {
      const meta = itemsMap.get(itemId);
      out.push({
        id: itemId,
        name: meta?.name || itemId,
        status: v?.status || "in_stock",
        quantity: v?.quantity ?? "",
        unit: v?.unit ?? meta?.defaultUnit ?? "",
      });
    }

    const rank = (s) => (s === "out_of_stock" ? 0 : s === "need_stock" ? 1 : 2);
    out.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));

    return out;
  }, [sub, itemsMap]);

  const outLowRows = useMemo(
    () => rows.filter((r) => r.status === "out_of_stock" || r.status === "need_stock"),
    [rows]
  );

  const okRows = useMemo(
    () => rows.filter((r) => r.status === "in_stock"),
    [rows]
  );

  async function confirmChanges() {
    if (!subRef) return;
    setMsg("");
    try {
      await updateDoc(subRef, {
        needsAdminReview: false,
        isReadByAdmin: true,
        adminConfirmedAt: serverTimestamp(),
      });
      setMsg("Confirmed ✅ Changes approved.");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Confirm failed.");
    }
  }

  async function markRead() {
    if (!subRef) return;
    setMsg("");
    try {
      await updateDoc(subRef, { isReadByAdmin: true });
      setMsg("Marked as read ✅");
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Update failed.");
    }
  }

  if (!storeId) return null;

  return (
    <div className="page">
      <div className="navbar">
        <button className="btn" onClick={() => nav(-1)}>Back</button>
        <div style={{ fontWeight: 900 }}>Submission • {dayId}</div>
        <div style={{ width: 60 }} />
      </div>

      {!sub ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              Submitted by: {sub.submittedByName || sub.submittedByEmployeeId}
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              Submitted at: {fmtTs(sub.submittedAt)}
            </div>

            {sub.lastEditedAt ? (
              <div className="muted" style={{ marginTop: 6 }}>
                Last edited by: {sub.lastEditedByName || sub.lastEditedByEmployeeId} • {fmtTs(sub.lastEditedAt)}
              </div>
            ) : null}

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sub.needsAdminReview ? <span className="badge red">NEEDS REVIEW</span> : <span className="badge green">OK</span>}
              {!sub.isReadByAdmin ? <span className="badge orange">UNREAD</span> : <span className="badge">READ</span>}
              <span className="badge">LOW: {sub.lowOutSummary?.lowCount ?? 0}</span>
              <span className="badge">OUT: {sub.lowOutSummary?.outCount ?? 0}</span>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={markRead}>Mark Read</button>
              {sub.needsAdminReview ? (
                <button className="btn primary" onClick={confirmChanges}>Confirm Changes</button>
              ) : null}
            </div>

            {msg ? <div className="muted" style={{ marginTop: 10 }}>{msg}</div> : null}
          </div>

          {/* ✅ OUT/LOW first */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Low / Out items</div>

            {outLowRows.length === 0 ? (
              <div className="muted">No low/out items ✅</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {outLowRows.map((r) => (
                  <div
                    key={r.id}
                    className="card"
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div style={{ minWidth: "60%" }}>
                      <div style={{ fontWeight: 900 }}>{r.name}</div>
                      <div className={badgeClass(r.status)} style={{ marginTop: 6 }}>
                        {badgeText(r.status)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900 }}>
                      {r.quantity} {r.unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ✅ OK items collapsible */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>OK items ({okRows.length})</div>
              <button className="btn" onClick={() => setShowOk((x) => !x)}>
                {showOk ? "Hide" : "Show"}
              </button>
            </div>

            {showOk ? (
              okRows.length === 0 ? (
                <div className="muted" style={{ marginTop: 10 }}>No OK items</div>
              ) : (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {okRows.map((r) => (
                    <div
                      key={r.id}
                      className="card"
                      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div style={{ minWidth: "60%" }}>
                        <div style={{ fontWeight: 900 }}>{r.name}</div>
                        <div className={badgeClass(r.status)} style={{ marginTop: 6 }}>
                          {badgeText(r.status)}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900 }}>
                        {r.quantity} {r.unit}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="muted" style={{ marginTop: 10 }}>Tap “Show” to view OK items.</div>
            )}
          </div>

          {/* ✅ revisions */}
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Revision history</div>
            {revisions.length === 0 ? (
              <div className="muted">No edits yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {revisions.map((r) => (
                  <div key={r.id} className="card" style={{ background: "rgba(0,0,0,.02)" }}>
                    <div style={{ fontWeight: 900 }}>
                      Edited by: {r.editedByName || r.editedByEmployeeId}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {fmtTs(r.editedAt)}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      LOW: {r.lowOutSummary?.lowCount ?? 0} • OUT: {r.lowOutSummary?.outCount ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
