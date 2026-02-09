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

  const [openCats, setOpenCats] = useState({}); // { "Meat": true }

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);

    const unsubItems = onSnapshot(collection(db, "stores", storeId, "items"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.isActive !== false);
      setItems(list);
    });

    const unsubStock = onSnapshot(collection(db, "stores", storeId, "currentStock"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStock(list);
      setLoading(false);
    });

    const unsubUnread = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), where("isReadByAdmin", "==", false)),
      (snap) => setUnreadCount(snap.size)
    );

    const unsubNeedsReview = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), where("needsAdminReview", "==", true)),
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
          category: it.category || "Uncategorized",
          categoryOrder: typeof it.categoryOrder === "number" ? it.categoryOrder : 999,
        });
      }
    }

    // OUT first then LOW then name
    list.sort((a, b) => {
      const ra = a.status === "out_of_stock" ? 0 : 1;
      const rb = b.status === "out_of_stock" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [items, stock]);

  const groupedLowOut = useMemo(() => {
    const map = new Map();
    for (const r of lowOut) {
      if (!map.has(r.category)) {
        map.set(r.category, { name: r.category, order: r.categoryOrder, items: [] });
      }
      map.get(r.category).items.push(r);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [lowOut]);

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
      {/* ✅ Modern header */}
      <div className="adminHeader">
        <div className="adminHeaderLeft">
          <div className="adminTitle">Admin</div>
          <div className="adminSub">
            Store <span className="storePill">{storeName || storeId}</span>
          </div>
        </div>

        <div className="adminHeaderRight">
          <NotificationBell count={unreadCount} onClick={() => nav("/admin/submissions")} />

          <button
            className="btn sm"
            onClick={() => {
              setStoreId(null);
              nav("/stores");
            }}
          >
            Switch
          </button>

          <button className="btn sm" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {/* ✅ Modern summary card */}
      <div className="adminPanel">
        <div className="statsRow">
          <div className="statCard">
            <div className="k">Unread submissions</div>
            <div className="v">{unreadCount}</div>
          </div>

          <div className="statCard">
            <div className="k">Needs review (edited)</div>
            <div className="v">{needsReviewCount}</div>
          </div>
        </div>

        <div className="adminActions">
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
        <div className="adminList">
          {groupedLowOut.map((group) => {
            const isOpen = openCats[group.name] ?? true;

            return (
              <div key={group.name} className="catBlock">
                <button
                  className="catHeader"
                  onClick={() => setOpenCats((p) => ({ ...p, [group.name]: !isOpen }))}
                >
                  <span className="catHeaderLeft">
                    <span className="catName">{group.name}</span>
                    <span className="catCount">{group.items.length}</span>
                  </span>
                  <span className="catArrow">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div className="list">
                    {group.items.map((r) => (
                      <div key={r.id} className="list-card">
                        <div className="list-main">
                          <div className="list-title">{r.name}</div>
                          <div className={badgeClass(r.status)}>{badgeText(r.status)}</div>
                        </div>

                        <div className="list-right">
                          {r.quantity} {r.unit}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AdminQuickBar />
    </div>
  );
}
