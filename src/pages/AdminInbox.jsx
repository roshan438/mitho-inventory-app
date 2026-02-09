// src/pages/AdminInbox.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";
import useCurrentStoreName from "../hooks/useCurrentStoreName";

export default function AdminInbox() {
  const nav = useNavigate();
  const { storeId } = useStore();
  const { storeName } = useCurrentStoreName();

  const [stockUnread, setStockUnread] = useState([]);
  const [tempUnread, setTempUnread] = useState([]);
  const [tab, setTab] = useState("all"); // all | stock | temp
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setMsg("");

    // stock submissions (unread)
    const unsubStock = onSnapshot(
      query(
        collection(db, "stores", storeId, "stockSubmissions"),
        orderBy("submittedDate", "desc")
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((x) => x.isReadByAdmin === false);
        setStockUnread(list);
      }
    );

    // temperature logs (unread)
    const unsubTemp = onSnapshot(
      query(
        collection(db, "stores", storeId, "temperatureLogs"),
        orderBy("submittedDate", "desc")
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((x) => x.isReadByAdmin === false);
        setTempUnread(list);
      }
    );

    return () => {
      unsubStock();
      unsubTemp();
    };
  }, [storeId, nav]);

  const allUnread = useMemo(() => {
    const stock = stockUnread.map((x) => ({
      type: "stock",
      id: x.id,
      date: x.submittedDate || x.id,
      by: x.submittedByName || "-",
      needsReview: !!x.needsAdminReview,
      badge: x?.lowOutSummary
        ? `OUT:${x.lowOutSummary?.outCount || 0} LOW:${x.lowOutSummary?.lowCount || 0}`
        : "",
    }));

    const temp = tempUnread.map((x) => ({
      type: "temp",
      id: x.id,
      date: x.submittedDate || x.id,
      by: x.submittedByName || "-",
      needsReview: !!x.needsAdminReview,
      hasOutOfRange: !!x.hasOutOfRange,
      badge: x.hasOutOfRange ? "ALERT" : "",
    }));

    // merge + newest first by date string (YYYY-MM-DD)
    return [...temp, ...stock].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [stockUnread, tempUnread]);

  const filtered = useMemo(() => {
    if (tab === "stock") return allUnread.filter((x) => x.type === "stock");
    if (tab === "temp") return allUnread.filter((x) => x.type === "temp");
    return allUnread;
  }, [allUnread, tab]);

  async function markRead(item) {
    if (!storeId) return;
    setMsg("");
    try {
      if (item.type === "stock") {
        await updateDoc(doc(db, "stores", storeId, "stockSubmissions", item.id), {
          isReadByAdmin: true,
        });
      } else {
        await updateDoc(doc(db, "stores", storeId, "temperatureLogs", item.id), {
          isReadByAdmin: true,
        });
      }
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Failed to mark as read.");
    }
  }

  function openItem(item) {
    // mark read and navigate
    markRead(item);
    if (item.type === "stock") nav("/admin/submissions"); // your existing page
    else nav("/admin/temperature"); // temp logs page
  }

  return (
    <div className="page">
      <div className="navbar">
        <div style={{ fontWeight: 900 }}>Inbox</div>
        <button className="btn" onClick={() => nav("/admin")}>Back</button>
      </div>

      <div className="card">
        <div style={{ fontWeight: 900 }}>
          Store: <span className="muted" style={{ fontWeight: 800 }}>{storeName || storeId}</span>
        </div>

        <div className="muted" style={{ margin: "6px 0 0" }}>
          Unread: <b>{allUnread.length}</b> (Stock {stockUnread.length} • Temp {tempUnread.length})
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button className={`btn ${tab === "all" ? "primary" : ""}`} onClick={() => setTab("all")}>
            All
          </button>
          <button className={`btn ${tab === "stock" ? "primary" : ""}`} onClick={() => setTab("stock")}>
            Stock
          </button>
          <button className={`btn ${tab === "temp" ? "primary" : ""}`} onClick={() => setTab("temp")}>
            Temperature
          </button>
        </div>

        {msg ? <div className="muted" style={{ marginTop: 10 }}>{msg}</div> : null}
      </div>

      <div className="section-title">Unread</div>

      {filtered.length === 0 ? (
        <div className="muted">Nothing unread ✅</div>
      ) : (
        <div className="list">
          {filtered.map((x) => (
            <div
              key={`${x.type}_${x.id}`}
              className="list-card"
              style={{ cursor: "pointer" }}
              onClick={() => openItem(x)}
            >
              <div className="list-main">
                <div className="list-title">
                  {x.type === "stock" ? "Stock submission" : "Temperature log"} • {x.date}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {x.type === "temp" && x.hasOutOfRange ? <span className="badge red">ALERT</span> : null}
                  {x.needsReview ? <span className="badge orange">EDITED</span> : null}
                  <span className="badge green">NEW</span>
                </div>
              </div>

              <div className="list-right" style={{ fontSize: 13 }}>
                {x.by}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
