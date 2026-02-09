import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import useCurrentStoreName from "../hooks/useCurrentStoreName";
import AdminQuickBar from "../components/AdminQuickBar";
import NotificationBell from "../components/NotificationBell";

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Tries to normalize different possible shapes of temperature log data.
 * Supports:
 * - doc.hasOutOfRange + doc.readings[]
 * - doc.entries[]
 * - doc.temps[]
 * - doc.equipmentReadings (object map)
 */
/**
 * Firestore today doc shape you have:
 * stores/{storeId}/temperatureLogs/{ymd}
 * {
 *   hasOutOfRange: true/false,
 *   fridge1: { label, temp, unit, note },
 *   fridge2: { ... },
 *   ...
 * }
 *
 * Store doc has temperatureEquipment: [{id,label,min,max}, ...]
 */
function normalizeTempLog(log) {
  if (!log) return { ok: true, rows: [], hasLog: false };

  const hasOutOfRange =
    log.hasOutOfRange === true ||
    log.anyOutOfRange === true ||
    log.outOfRange === true;

  let rows = [];

  // arrays
  if (Array.isArray(log.readings)) rows = log.readings;
  else if (Array.isArray(log.entries)) rows = log.entries;
  else if (Array.isArray(log.temps)) rows = log.temps;

  // ✅ your real shape: equipment: { fridge1: {...}, fridge2: {...} }
  if (!rows.length && log.equipment && typeof log.equipment === "object") {
    rows = Object.entries(log.equipment).map(([id, v]) => ({ id, ...v }));
  }

  // optional support
  if (!rows.length && log.equipmentReadings && typeof log.equipmentReadings === "object") {
    rows = Object.entries(log.equipmentReadings).map(([id, v]) => ({ id, ...v }));
  }

  const norm = rows
    .map((r) => {
      const label = r.label || r.name || r.title || r.equipmentLabel || "Equipment";

      const temp =
        r.tempC ??
        r.temp ??
        r.value ??
        r.temperature ??
        (typeof r.celsius === "number" ? r.celsius : null);

      const min = r.min ?? r.minC ?? r.minTemp ?? r.low ?? null;
      const max = r.max ?? r.maxC ?? r.maxTemp ?? r.high ?? null;

      // ✅ prefer Firestore flag if present
      let inRange = r.inRange;

      const outFlag =
        r.outOfRange === true ||
        r.outOfRangetrue === true; // harmless fallback (typo safety)

      if (outFlag) inRange = false;

      // compute if still unknown
      if (typeof inRange !== "boolean" && typeof temp === "number") {
        if (typeof min === "number" && temp < min) inRange = false;
        else if (typeof max === "number" && temp > max) inRange = false;
        else if (typeof min === "number" || typeof max === "number") inRange = true;
        else inRange = true;
      }

      return {
        id: r.id || r.equipmentId || label,
        label,
        temp,
        min,
        max,
        inRange: typeof inRange === "boolean" ? inRange : true,
      };
    })
    .filter((x) => x.label);

  const bad = norm.filter((x) => x.inRange === false);
  const ok = !hasOutOfRange && bad.length === 0;

  // ✅ if hasOutOfRange true, prefer showing only bad ones (else show all)
  return { ok, rows: bad.length ? bad : norm, hasLog: true };
}





export default function AdminDashboard() {
  const nav = useNavigate();
  const { setStoreId } = useStore();
  const { storeId, storeName } = useCurrentStoreName();
  const { logout } = useAuth();

  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);

  // ✅ Stock notifications
  const [unreadStockCount, setUnreadStockCount] = useState(0);
  const [needsReviewStockCount, setNeedsReviewStockCount] = useState(0);

  // ✅ Temp notifications
  const [unreadTempCount, setUnreadTempCount] = useState(0);
  const [needsReviewTempCount, setNeedsReviewTempCount] = useState(0);

  const [equipRanges, setEquipRanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState({}); // { "Meat": true }

  // ✅ Today temp summary
  const [tempToday, setTempToday] = useState({ ok: true, rows: [], hasLog: false });
  const ymd = todayYMD();
  const [tempConfig, setTempConfig] = useState([]); // from store.temperatureEquipment


  useEffect(() => {
    if (!storeId) return;
  
    const storeRef = doc(db, "stores", storeId);
  
    const unsub = onSnapshot(storeRef, (snap) => {
      const data = snap.data();
      const arr = Array.isArray(data?.temperatureEquipment)
        ? data.temperatureEquipment
        : [];
  
      const map = {};
      for (const e of arr) {
        if (!e?.id) continue;
        map[e.id] = {
          min: typeof e.min === "number" ? e.min : null,
          max: typeof e.max === "number" ? e.max : null,
        };
      }
      setEquipRanges(map);
    });
  
    return () => unsub();
  }, [storeId]);
  

  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }

    setLoading(true);

    const unsubStore = onSnapshot(doc(db, "stores", storeId), (snap) => {
      const data = snap.data();
      setTempConfig(Array.isArray(data?.temperatureEquipment) ? data.temperatureEquipment : []);
    });

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

    // ✅ Stock unread + needs review
    const unsubUnreadStock = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), where("isReadByAdmin", "==", false)),
      (snap) => setUnreadStockCount(snap.size)
    );

    const unsubNeedsReviewStock = onSnapshot(
      query(collection(db, "stores", storeId, "stockSubmissions"), where("needsAdminReview", "==", true)),
      (snap) => setNeedsReviewStockCount(snap.size)
    );

    // ✅ Temp unread + needs review
    const unsubUnreadTemp = onSnapshot(
      query(collection(db, "stores", storeId, "temperatureLogs"), where("isReadByAdmin", "==", false)),
      (snap) => setUnreadTempCount(snap.size)
    );

    const unsubNeedsReviewTemp = onSnapshot(
      query(collection(db, "stores", storeId, "temperatureLogs"), where("needsAdminReview", "==", true)),
      (snap) => setNeedsReviewTempCount(snap.size)
    );

  
    

    return () => {
      unsubItems();
      unsubStock();
      unsubUnreadStock();
      unsubNeedsReviewStock();
      unsubUnreadTemp();
      unsubNeedsReviewTemp();
      unsubStore();
    };
  }, [storeId, nav]);

  // ✅ Load today's temp log (once per store/day)
  useEffect(() => {
    if (!storeId) return;
  
    const ref = doc(db, "stores", storeId, "temperatureLogs", ymd);
  
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setTempToday({ ok: true, rows: [], hasLog: false });
          return;
        }
        setTempToday(normalizeTempLog(snap.data(), equipRanges));
      } catch (e) {
        console.error("Temp today load failed:", e);
        setTempToday({ ok: true, rows: [], hasLog: false });
      }
    })();
  }, [storeId, ymd, equipRanges]);
  
  
  

  const unreadCount = unreadStockCount + unreadTempCount;

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
      if (!map.has(r.category)) map.set(r.category, { name: r.category, order: r.categoryOrder, items: [] });
      map.get(r.category).items.push(r);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [lowOut]);
  // const tag = typeof r.temp === "number" && typeof r.max === "number" && r.temp > r.max
  //   ? "HIGH"
  //   : typeof r.temp === "number" && typeof r.min === "number" && r.temp < r.min
  //   ? "LOW"
  //   : "OUT";
    

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
  function tempTag(r) {
    if (typeof r.temp === "number" && typeof r.max === "number" && r.temp > r.max) return "HIGH";
    if (typeof r.temp === "number" && typeof r.min === "number" && r.temp < r.min) return "LOW";
    return "OUT";
  }
  
  function tempTagClass(r) {
    const t = tempTag(r);
    if (t === "HIGH") return "adminDashAlertTag high";
    if (t === "LOW") return "adminDashAlertTag low";
    return "adminDashAlertTag out";
  }
  

  return (
    <div className="page adminDash">
      {/* Top header */}
      <div className="adminDashTop">
        <div className="adminDashTitleWrap">
          <div className="adminDashTitle">Admin Dashboard</div>
          <div className="adminDashSub">
            Store <span className="adminDashStore">{storeName || storeId}</span>
          </div>
        </div>

        <div className="adminDashTopBtns">
          <button className="adminPillBtn" onClick={logout}>
          Logout
        </button>
        </div>
      </div>

      {/* Utility row (switch + bell + logout) */}
      <div className="adminDashUtility">
        <button
          className="adminPillBtn"
          onClick={() => {
            setStoreId(null);
            nav("/stores");
          }}
        >
          🔁 Switch{" "}
          
        </button>

        <button className="adminPillBtn" onClick={() => nav("/admin/inbox")}>
          🔔 Inbox{" "}
          {unreadCount > 0 ? <span className="adminBadgeDot">{unreadCount}</span> : null}
        </button>

        
      </div>

      {/* Primary Actions */}
      <div className="adminDashCard">
        <div className="adminDashCardTitle">Primary Actions</div>

        <div className="adminDashStatsGrid">
          
          <button className="adminDashStatTile">
            <div className="k">Unread stock</div>
            <div className="v">{unreadStockCount}</div>
          </button>

          <button className="adminDashStatTile" >
            <div className="k">Unread temperature</div>
            <div className="v">{unreadTempCount}</div>
          </button>
        </div>

        {/* Action grid like mock */}
        <div className="adminDashActionsGrid">
          <button className="adminDashActionBtn" onClick={() => nav("/admin/items")}>📦 Items</button>
          <button className="adminDashActionBtn" onClick={() => nav("/admin/employees")}>👤 Employees</button>
          <button className="adminDashActionBtn" onClick={() => nav("/admin/stores")}>🏪 Stores</button>
          <button className="adminDashActionBtn wide" onClick={() => nav("/admin/reports")}>📊 Reports</button>
        </div>
      </div>

      {/* Temperature Alerts (SURFACE HERE) */}
      <div className="adminDashCard">
        <div className="adminDashCardRow">
          <div className="adminDashCardTitle">🔥 Temperature Alerts</div>
          <button className="adminDashChevronBtn" onClick={() => nav("/admin/temperature")}>
            ›
          </button>
        </div>

        {tempToday.hasLog ? (
          <>
          {tempToday.hasOutFlag && (
  <div className="adminDashWarnBanner">
    ⚠️ Out of range detected in today’s temperature log.
    <div className="adminDashWarnSub">
      Some equipment may be missing ranges (min/max). Check the temperature logs.
    </div>
  </div>
)}

          {tempToday.ok ? (
            <div className="adminDashOkRow">
              <span className="adminDashOkDot">✓</span>
              <span>All temperatures within range today</span>
            </div>
          ) : (
            <div className="adminDashAlertList">
              {tempToday.rows.slice(0, 4).map((r) => (
                <div key={r.id} className="adminDashAlertRow">
                  <div className="adminDashAlertLeft">
                    <div className="adminDashAlertName">{r.label}</div>
                    <div className="adminDashAlertMeta">
                      Range:{" "}
                      {typeof r.min === "number" ? `${r.min}°C` : "—"}{" "}
                      to{" "}
                      {typeof r.max === "number" ? `${r.max}°C` : "—"}
                    </div>
                  </div>
                  <div className="adminDashAlertRight">
                    <span className="adminDashAlertTemp">
                      {typeof r.temp === "number" ? `${r.temp}°C` : "—"}
                    </span>
                    {/* <span className={`adminDashAlertTag ${tag.toLowerCase()}`}> */}
                    
                      {/* {typeof r.temp === "number" && typeof r.max === "number" && r.temp > r.max
                        ? "HIGH"
                        : typeof r.temp === "number" && typeof r.min === "number" && r.temp < r.min
                        ? "LOW"
                        : "OUT"} */}
                    {/* </span> */}
                    <span className={tempTagClass(r)}>{tempTag(r)}</span>

                  </div>
                </div>
              ))}

              <button className="adminDashViewBtn" onClick={() => nav("/admin/temperature")}>
                View temperature logs →
              </button>
            </div>
          )}
          </>
        ) : (
          <div className="muted">No temperature log submitted today.</div>
        )}
      </div>

      {/* Low / Out of stock (your current UI unchanged) */}
      <div className="section-title">Low / Out of stock</div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : lowOut.length === 0 ? (
        <div className="muted">No low/out items ✅</div>
      ) : (
        <div className="adminList">
          {groupedLowOut.map((group) => {
            const isOpen = openCats[group.name] ?? false;

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

      {/* Keep your existing quickbar */}
      <AdminQuickBar unreadStockCount={unreadStockCount } unreadTempCount={unreadTempCount }/>

      {/* Keep your existing bell component alive (optional) */}
      {/* <NotificationBell count={unreadCount} onClick={() => nav("/admin/inbox")} /> */}
    </div>
  );
}
