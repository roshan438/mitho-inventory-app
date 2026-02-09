import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import AdminQuickBar from "../components/AdminQuickBar";

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function badgeClass(status) {
  if (status === "out_of_stock") return "badge red";
  if (status === "need_stock") return "badge orange";
  return "badge green";
}
function badgeText(status) {
  if (status === "out_of_stock") return "OUT";
  if (status === "need_stock") return "LOW";
  return "OK";
}

export default function AdminDailySummary() {
  const nav = useNavigate();
  const { storeId, setStoreId } = useStore();
  const { logout } = useAuth();

  const [itemsMap, setItemsMap] = useState(new Map());
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);

  const [unreadCount, setUnreadCount] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);

  const ymd = todayYMD();

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);

    // items (to show names)
    const unsubItems = onSnapshot(collection(db, "stores", storeId, "items"), (snap) => {
      const m = new Map();
      snap.docs.forEach((d) => m.set(d.id, d.data()));
      setItemsMap(m);
    });

    // today submission doc
    const ref = doc(db, "stores", storeId, "stockSubmissions", ymd);
    const unsubSub = onSnapshot(ref, (snap) => {
      setSubmission(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });

    // unread + needs review (same as dashboard)
    const unsubUnread = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), where("isReadByAdmin", "==", false)),
      (snap) => setUnreadCount(snap.size)
    );

    const unsubReview = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), where("needsAdminReview", "==", true)),
      (snap) => setNeedsReviewCount(snap.size)
    );

    return () => {
      unsubItems();
      unsubSub();
      unsubUnread();
      unsubReview();
    };
  }, [storeId, nav, ymd]);

  const { outList, lowList } = useMemo(() => {
    const out = [];
    const low = [];
    const obj = submission?.items || {};

    for (const [itemId, v] of Object.entries(obj)) {
      const meta = itemsMap.get(itemId);
      const name = meta?.name || itemId;
      const unit = v?.unit || meta?.defaultUnit || "";
      const quantity = v?.quantity ?? "-";
      const status = v?.status || null;

      const row = { id: itemId, name, unit, quantity, status };

      if (status === "out_of_stock") out.push(row);
      else if (status === "need_stock") low.push(row);
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    low.sort((a, b) => a.name.localeCompare(b.name));

    return { outList: out, lowList: low };
  }, [submission, itemsMap]);

  const submittedLabel = useMemo(() => {
    if (!submission) return "Not submitted yet";
    const by = submission.submittedByName || submission.submittedByEmployeeId || "Employee";
    return `Submitted ✅ by ${by}`;
  }, [submission]);

  return (
    <div className="page">
      {/* compact header */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-title">Daily Summary</div>
          <div className="topbar-sub">
            Store: <b className="store-pill">{storeId}</b> • {ymd}
          </div>
        </div>

        <div className="topbar-right">
        
        <button className="btn" onClick={() => nav("/admin")}>Back</button>
        </div>
      </div>

      {/* small stats */}
      <div className="stats-row">
        <div className="stat">
          <div className="k">Unread</div>
          <div className="v">{unreadCount}</div>
        </div>
        <div className="stat">
          <div className="k">Needs review</div>
          <div className="v">{needsReviewCount}</div>
        </div>
      </div>

      {/* summary card */}
      <div className="card" style={{ borderRadius: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{submittedLabel}</div>

        {submission ? (
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Low: <b>{submission?.lowOutSummary?.lowCount ?? lowList.length}</b> • Out:{" "}
            <b>{submission?.lowOutSummary?.outCount ?? outList.length}</b>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Ask employee to submit end-of-shift.
          </div>
        )}
      </div>

      <div className="section-title">OUT</div>
      {loading ? (
        <div className="muted">Loading…</div>
      ) : outList.length === 0 ? (
        <div className="muted">No OUT items ✅</div>
      ) : (
        <div className="list">
          {outList.map((r) => (
            <div key={r.id} className="list-card">
              <div className="list-left">
                <div className="list-title">{r.name}</div>
                <div className={badgeClass(r.status)} style={{ marginTop: 6 }}>
                  {badgeText(r.status)}
                </div>
              </div>
              <div className="list-right">
                {r.quantity} {r.unit}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-title" style={{ marginTop: 14 }}>LOW</div>
      {loading ? (
        <div className="muted">Loading…</div>
      ) : lowList.length === 0 ? (
        <div className="muted">No LOW items ✅</div>
      ) : (
        <div className="list">
          {lowList.map((r) => (
            <div key={r.id} className="list-card">
              <div className="list-left">
                <div className="list-title">{r.name}</div>
                <div className={badgeClass(r.status)} style={{ marginTop: 6 }}>
                  {badgeText(r.status)}
                </div>
              </div>
              <div className="list-right">
                {r.quantity} {r.unit}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ✅ bottom quick bar */}
      <AdminQuickBar />
    </div>
  );
}
