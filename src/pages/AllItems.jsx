import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";

export default function AllItems() {
  const nav = useNavigate();
  const { storeId } = useStore();
  const { profile } = useAuth();

  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    (async () => {
      setLoading(true);

      const itemsSnap = await getDocs(collection(db, "stores", storeId, "items"));
      const stockSnap = await getDocs(collection(db, "stores", storeId, "currentStock"));

      const itemsArr = itemsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.isActive !== false);

      const stockArr = stockSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setItems(itemsArr);
      setStock(stockArr);
      setLoading(false);
    })();
  }, [storeId, nav]);

  const merged = useMemo(() => {
    const stockMap = new Map(stock.map((s) => [s.id, s]));
    return items
      .map((it) => {
        const s = stockMap.get(it.id);
        return {
          id: it.id,
          name: it.name,
          category: it.category || "",
          quantity: s?.quantity ?? "-",
          unit: s?.unit ?? it.defaultUnit ?? "",
          status: s?.status ?? "unknown",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, stock]);

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

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 700 }}>All Items</div>
        <button className="btn" onClick={() => nav(profile?.role === "admin" ? "/admin" : "/employee")}>
          Back
        </button>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {merged.map((r) => (
            <div key={r.id} className="card" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: "60%" }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div className={badgeClass(r.status)} style={{ marginTop: 6 }}>
                  {badgeText(r.status)}
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>
                {r.quantity} {r.unit}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
