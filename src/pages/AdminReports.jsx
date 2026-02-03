import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useStore } from "../context/StoreContext";

function startOfWeek(date) {
  // Week starts Monday (AU style)
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const nav = useNavigate();
  const { storeId } = useStore();

  const [mode, setMode] = useState("weekly"); // weekly | monthly
  const [anchor, setAnchor] = useState(() => fmtDate(new Date()));
  const [subs, setSubs] = useState([]);
  const [itemsMap, setItemsMap] = useState(new Map());
  const [loading, setLoading] = useState(true);

  // Load items map once (id -> item meta)
  useEffect(() => {
    if (!storeId) {
      nav("/stores");
      return;
    }
    (async () => {
      const snap = await getDocs(collection(db, "stores", storeId, "items"));
      setItemsMap(new Map(snap.docs.map((d) => [d.id, d.data()])));
    })();
  }, [storeId, nav]);

  // Compute date range
  const range = useMemo(() => {
    const a = new Date(anchor + "T00:00:00");
    const start = mode === "weekly" ? startOfWeek(a) : startOfMonth(a);
    const end = endOfDay(new Date(a)); // end at anchor day
    return { start, end };
  }, [mode, anchor]);

  // Live submissions in range (by submittedAt timestamp)
  useEffect(() => {
    if (!storeId) return;

    setLoading(true);

    const qRef = query(
      collection(db, "stores", storeId, "stockSubmissions"),
      where("submittedAt", ">=", Timestamp.fromDate(range.start)),
      where("submittedAt", "<=", Timestamp.fromDate(range.end)),
      orderBy("submittedAt", "desc")
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setSubs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [storeId, range.start, range.end]);

  // Aggregate summary
  const summary = useMemo(() => {
    let totalOut = 0;
    let totalLow = 0;

    // per item counters
    const perItem = new Map(); // itemId -> { out, low, ok, lastQty, unit }

    for (const s of subs) {
      const items = s.items || {};
      for (const [itemId, v] of Object.entries(items)) {
        const status = v.status || "in_stock";
        const qty = v.quantity;
        const unit = v.unit;

        if (!perItem.has(itemId)) {
          perItem.set(itemId, { out: 0, low: 0, ok: 0, lastQty: null, unit: unit || "" });
        }

        const row = perItem.get(itemId);

        if (status === "out_of_stock") {
          row.out += 1;
          totalOut += 1;
        } else if (status === "need_stock") {
          row.low += 1;
          totalLow += 1;
        } else {
          row.ok += 1;
        }

        // keep latest qty seen (subs are desc)
        if (row.lastQty === null && typeof qty !== "undefined") {
          row.lastQty = qty;
          row.unit = unit || row.unit;
        }
      }
    }

    const topProblems = [...perItem.entries()]
      .map(([itemId, row]) => ({
        itemId,
        name: itemsMap.get(itemId)?.name || itemId,
        out: row.out,
        low: row.low,
        ok: row.ok,
        lastQty: row.lastQty,
        unit: row.unit || itemsMap.get(itemId)?.defaultUnit || "",
        score: row.out * 2 + row.low, // OUT weighted higher
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 12);

    return {
      totalSubmissions: subs.length,
      totalOut,
      totalLow,
      topProblems,
    };
  }, [subs, itemsMap]);

  function exportSummaryCSV() {
    const filename = `report_${storeId}_${mode}_${fmtDate(range.start)}_to_${fmtDate(range.end)}_summary.csv`;
    const header = ["Item", "OUT count", "LOW count", "OK count", "Score", "Last qty", "Unit"];
    const rows = [header];

    for (const r of summary.topProblems) {
      rows.push([r.name, r.out, r.low, r.ok, r.score, r.lastQty ?? "", r.unit ?? ""]);
    }
    downloadCSV(filename, rows);
  }

  function exportDetailedCSV() {
    const filename = `report_${storeId}_${mode}_${fmtDate(range.start)}_to_${fmtDate(range.end)}_detailed.csv`;

    const header = [
      "submittedDate",
      "submittedAt",
      "submittedBy",
      "itemId",
      "itemName",
      "quantity",
      "unit",
      "status",
    ];

    const rows = [header];

    for (const s of subs) {
      const submittedDate = s.submittedDate || s.id;
      const submittedAt = s.submittedAt?.toDate ? s.submittedAt.toDate().toISOString() : "";
      const submittedBy = s.submittedByName || s.submittedByEmployeeId || "";

      const items = s.items || {};
      for (const [itemId, v] of Object.entries(items)) {
        const name = itemsMap.get(itemId)?.name || itemId;
        rows.push([
          submittedDate,
          submittedAt,
          submittedBy,
          itemId,
          name,
          v.quantity ?? "",
          v.unit ?? "",
          v.status ?? "",
        ]);
      }
    }

    downloadCSV(filename, rows);
  }

  return (
    <div className="page">
      <div className="navbar">
        <button className="btn" onClick={() => nav(-1)}>Back</button>
        <div style={{ fontWeight: 900 }}>Reports</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Report Range (compact row for mobile) */}
      <div className="card compact">
        <div style={{ fontWeight: 900 }}>Report range</div>

        <div className="toolbar-row">
          <div className="segment">
            <button
              className={`btn ${mode === "weekly" ? "primary" : ""}`}
              onClick={() => setMode("weekly")}
            >
              Weekly
            </button>
            <button
              className={`btn ${mode === "monthly" ? "primary" : ""}`}
              onClick={() => setMode("monthly")}
            >
              Monthly
            </button>
          </div>

          <div className="dateWrap">
            <input
              className="input"
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
          </div>
        </div>

        <div className="muted" style={{ marginTop: 6 }}>
          {fmtDate(range.start)} → {fmtDate(range.end)}
        </div>
      </div>

      {/* Metrics compact */}
      <div className="card compact" style={{ marginTop: 12 }}>
        <div className="metrics-grid">
          <div className="metric">
            <div className="k">Submissions</div>
            <div className="v">{loading ? "…" : summary.totalSubmissions}</div>
          </div>
          <div className="metric">
            <div className="k">OUT events</div>
            <div className="v">{loading ? "…" : summary.totalOut}</div>
          </div>
          <div className="metric">
            <div className="k">LOW events</div>
            <div className="v">{loading ? "…" : summary.totalLow}</div>
          </div>
          <div className="metric">
            <div className="k">Store</div>
            <div className="v" style={{ fontSize: 14 }}>{storeId || "-"}</div>
          </div>
        </div>
      </div>

      {/* Export compact */}
      <div className="card compact" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 900 }}>Export</div>
        <div className="muted">Download this report as CSV.</div>

        <div className="action-grid" style={{ marginTop: 10 }}>
          <button
            className="btn"
            disabled={loading || summary.topProblems.length === 0}
            onClick={exportSummaryCSV}
          >
            Export Summary CSV
          </button>

          <button
            className="btn primary"
            disabled={loading || subs.length === 0}
            onClick={exportDetailedCSV}
          >
            Export Detailed CSV
          </button>
        </div>
      </div>

      <div className="section-title">Top problem items</div>

      {loading ? (
        <div className="muted">Loading report…</div>
      ) : summary.topProblems.length === 0 ? (
        <div className="muted">No data in this range yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {summary.topProblems.map((r) => (
            <div key={r.itemId} className="card compact">
              <div className="stock-row">
                <div className="left">
                  <div className="name">{r.name}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {r.out > 0 ? <span className="badge red">OUT {r.out}</span> : null}
                    {r.low > 0 ? <span className="badge orange">LOW {r.low}</span> : null}
                    <span className="badge green">OK {r.ok}</span>
                  </div>
                </div>

                <div className="qty">
                  {r.lastQty ?? "-"} {r.unit}
                </div>
              </div>

              <div className="muted" style={{ marginTop: 6 }}>
                Score: {r.score} (OUT counts double)
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => nav("/admin/submissions")}>
          View submissions list
        </button>
      </div>
    </div>
  );
}
