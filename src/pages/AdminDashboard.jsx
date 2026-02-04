import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import useCurrentStoreName from "../hooks/useCurrentStoreName";
import AdminQuickBar from "../components/AdminQuickBar";



import NotificationBell from "../components/NotificationBell";

export default function AdminDashboard() {
  const nav = useNavigate();
  const { setStoreId } = useStore();
const { storeId, storeName } = useCurrentStoreName();

  const { logout } = useAuth();

  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);

    // ✅ Live items
    const unsubItems = onSnapshot(
      collection(db, "stores", storeId, "items"),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((x) => x.isActive !== false);
        setItems(list);
      }
    );

    // ✅ Live current stock
    const unsubStock = onSnapshot(
      collection(db, "stores", storeId, "currentStock"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStock(list);
        setLoading(false);
      }
    );

    // ✅ Live unread submissions
    const unsubUnread = onSnapshot(
      query(
        collection(db, "stores", storeId, "stockSubmissions"),
        where("isReadByAdmin", "==", false)
      ),
      (snap) => setUnreadCount(snap.size)
    );

    // ✅ Live needs-review submissions (edited)
    const unsubNeedsReview = onSnapshot(
      query(
        collection(db, "stores", storeId, "stockSubmissions"),
        where("needsAdminReview", "==", true)
      ),
      (snap) => setNeedsReviewCount(snap.size)
    );

    return () => {
      unsubItems();
      unsubStock();
      unsubUnread();
      unsubNeedsReview();
    };
  }, [storeId, nav]);

  const lowOut = useMemo(() => {
    const stockMap = new Map(stock.map((s) => [s.id, s]));
    const list = [];

    for (const it of items) {
      const s = stockMap.get(it.id);
      const status = s?.status ?? null;

      if (status === "out_of_stock" || status === "need_stock") {
        list.push({
          id: it.id,
          name: it.name,
          status,
          quantity: s?.quantity ?? "-",
          unit: s?.unit ?? it.defaultUnit ?? "",
        });
      }
    }

    // out first, then low
    list.sort((a, b) => {
      const rank = (x) => (x.status === "out_of_stock" ? 0 : 1);
      return rank(a) - rank(b);
    });

    return list;
  }, [items, stock]);

  function badgeText(status) {
    if (status === "out_of_stock") return "OUT";
    if (status === "need_stock") return "LOW";
    return "OK";
  }

  function badgeClass(status) {
    if (status === "out_of_stock") return "badge red";
    if (status === "need_stock") return "badge orange";
    return "badge green";
  }

  return (
    <div className="page">
      <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-title">Admin</div>
        <div className="topbar-sub">
          Store: <b className="store-pill">{storeId}</b>
        </div>
      </div></div>

    <div className="topbar-right">
      <NotificationBell count={unreadCount} onClick={() => nav("/admin/submissions")} />

      <button className="btn sm" onClick={() => { setStoreId(null); nav("/stores"); }}>
        Switch
      </button>

      <button className="btn sm" onClick={logout}>
        Logout
      </button>
    </div>


      <div className="card admin-summary">
  <div style={{ fontWeight: 900, fontSize: 16 }}>
  Store: <span className="muted" style={{ fontWeight: 800 }}>{storeName || storeId}</span>

  </div>

  <div className="admin-metrics">
    <div className="metric">
      <div className="k">Unread submissions</div>
      <div className="v">{unreadCount}</div>
    </div>
    <div className="metric">
      <div className="k">Needs review (edited)</div>
      <div className="v">{needsReviewCount}</div>
    </div>
  </div>

  {/* ✅ one clean action grid (no duplicates) */}
  <div className="action-grid-2">
    <button className="btn" onClick={() => nav("/admin/reports")}>Reports</button>

    <button className="btn" onClick={() => nav("/admin/employees")}>Employees</button>
    <button className="btn" onClick={() => nav("/admin/stores")}>Stores</button>

    <button className="btn ghost" onClick={() => nav("/all-items")}>All Items</button>
  </div>
</div>


<div className="section-title">Low / Out of stock</div>


      {loading ? (
        <div className="muted">Loading…</div>
      ) : lowOut.length === 0 ? (
        <div className="muted">No low/out items ✅</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
  {lowOut.map((r) => (
    <div key={r.id} className="card">
      <div className="stock-row">
        <div className="left">
          <div className="name">{r.name}</div>
          <div className={badgeClass(r.status)} style={{ marginTop: 8 }}>
            {badgeText(r.status)}
          </div>
        </div>

        <div className="qty">
          {r.quantity} {r.unit}
        </div>
      </div>
    </div>
  ))}
</div>

      )}
      <AdminQuickBar />

    </div>
  );
}
