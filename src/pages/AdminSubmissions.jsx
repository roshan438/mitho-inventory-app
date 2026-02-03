import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

function formatTime(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return d.toLocaleString();
}

export default function AdminSubmissions() {
  const nav = useNavigate();
  const { storeId } = useStore();

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState([]);
  const [itemsMap, setItemsMap] = useState(new Map());
  const [selected, setSelected] = useState(null);
  const [marking, setMarking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ✅ load items once
  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    (async () => {
      const itemsSnap = await getDocs(collection(db, "stores", storeId, "items"));
      const map = new Map(itemsSnap.docs.map((d) => [d.id, d.data()]));
      setItemsMap(map);
    })();
  }, [storeId, nav]);

  // ✅ live submissions
  useEffect(() => {
    if (!storeId) return;

    setLoading(true);

    const unsub = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), orderBy("submittedAt", "desc")),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSubs(list);

        // keep selected in sync (by id)
        setSelected((prev) => {
          if (!prev) return list[0] || null;
          const updated = list.find((x) => x.id === prev.id);
          return updated || list[0] || null;
        });

        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId]);

  const selectedRows = useMemo(() => {
    if (!selected?.items) return [];
    const rows = [];

    for (const [itemId, val] of Object.entries(selected.items)) {
      const item = itemsMap.get(itemId);
      rows.push({
        id: itemId,
        name: item?.name || itemId,
        quantity: val.quantity,
        unit: val.unit,
        status: val.status,
      });
    }

    const rank = (s) => (s === "out_of_stock" ? 0 : s === "need_stock" ? 1 : 2);
    rows.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));

    return rows;
  }, [selected, itemsMap]);

  async function markAsRead() {
    if (!selected || !storeId) return;
    setMarking(true);
    try {
      await updateDoc(doc(db, "stores", storeId, "stockSubmissions", selected.id), {
        isReadByAdmin: true,
      });
    } finally {
      setMarking(false);
    }
  }

  async function confirmChanges() {
    if (!selected || !storeId) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, "stores", storeId, "stockSubmissions", selected.id), {
        needsAdminReview: false,
        isReadByAdmin: true,
        adminConfirmedAt: serverTimestamp(),
      });
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="muted">Loading submissions…</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 900 }}>Shift Submissions</div>
        <button className="btn" onClick={() => nav("/admin")}>Back</button>
      </div>

      <div className="section-title">All submissions</div>

<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
  {subs.map((s) => (
    <button
      key={s.id}
      className="card"
      style={{ textAlign: "left" }}
      onClick={() => nav(`/admin/submissions/${s.id}`)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: "60%" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {s.submittedByName || s.submittedByEmployeeId || "Employee"}
          </div>

          <div className="muted" style={{ marginTop: 4 }}>
            {s.submittedDate || s.id} • {formatTime(s.submittedAt)}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!s.isReadByAdmin ? <span className="badge red">NEW</span> : <span className="badge green">READ</span>}
            {s.needsAdminReview ? <span className="badge orange">EDITED</span> : null}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            OUT {s?.lowOutSummary?.outCount ?? 0}
          </div>
          <div className="muted" style={{ fontWeight: 900 }}>
            LOW {s?.lowOutSummary?.lowCount ?? 0}
          </div>
        </div>
      </div>
    </button>
  ))}
</div>

{subs.length === 0 ? (
  <div className="muted" style={{ marginTop: 12 }}>
    No submissions yet.
  </div>
) : null}

      
    </div>
  );
}
