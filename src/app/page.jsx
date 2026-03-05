"use client";

import { useState, useEffect, useRef } from "react";

// ─── API helpers ────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

// ─── Barcode lookup helpers ──────────────────────────────────────────────

// Open Library — best for books (ISBN-13 barcodes start with 978 or 979)
async function lookupOpenLibrary(barcode) {
  try {
    const res = await fetch(
      `https://openlibrary.org/isbn/${barcode}.json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.title) {
      return { name: data.title, source: "Open Library" };
    }
    return null;
  } catch {
    return null;
  }
}

// Open Food Facts — good for food / grocery items
async function lookupOpenFoodFacts(barcode) {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const name = data.product.product_name || data.product.product_name_en || null;
      return name ? { name, source: "Open Food Facts" } : null;
    }
    return null;
  } catch {
    return null;
  }
}

// UPCitemdb — general product database (movies, electronics, etc.)
async function lookupUPCitemdb(barcode) {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      const name = item.title || item.description || null;
      if (!name) return null;
      // Detect if this looks like a movie / film / TV media
      const category = (item.category || "").toLowerCase();
      const titleLower = name.toLowerCase();
      const isMedia =
        category.includes("movie") || category.includes("dvd") ||
        category.includes("blu-ray") || category.includes("video") ||
        category.includes("film") || titleLower.includes("dvd") ||
        titleLower.includes("blu-ray") || titleLower.includes("blu ray");
      return { name, source: "UPCitemdb", isMedia };
    }
    return null;
  } catch {
    return null;
  }
}

// TMDB — search for movie/TV by title for richer metadata
async function lookupTMDB(title) {
  try {
    // Use the API route proxy to avoid exposing API keys client-side
    const res = await fetch(
      `/api/tmdb?query=${encodeURIComponent(title)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.name) {
      return { name: data.name, source: "TMDB" };
    }
    return null;
  } catch {
    return null;
  }
}

// Cascading lookup — tries sources in order, reports progress
async function lookupBarcode(barcode, onProgress) {
  const isISBN = /^(978|979)/.test(barcode);

  // Build the lookup cascade based on barcode type
  const steps = [];
  if (isISBN) {
    steps.push({ label: "Open Library", fn: () => lookupOpenLibrary(barcode) });
  }
  steps.push({ label: "Open Food Facts", fn: () => lookupOpenFoodFacts(barcode) });
  steps.push({ label: "UPCitemdb", fn: () => lookupUPCitemdb(barcode) });

  for (const step of steps) {
    if (onProgress) onProgress(step.label);
    const result = await step.fn();
    if (result) {
      // If UPCitemdb found media, try TMDB for a better name
      if (result.isMedia) {
        if (onProgress) onProgress("TMDB");
        const tmdbResult = await lookupTMDB(result.name);
        if (tmdbResult) return tmdbResult;
      }
      return result;
    }
  }

  return null;
}

// ─── Export helpers ─────────────────────────────────────────────────────
function escapeCSV(val) {
  const s = String(val ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function generateCSV(items) {
  const header = ["Name", "Barcode", "Quantity", "Added By", "Added At"];
  const rows = items.map((it) => [
    escapeCSV(it.name),
    escapeCSV(it.barcode || ""),
    it.qty,
    escapeCSV(it.added_by),
    it.added_at,
  ]);
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function generateTXT(items) {
  if (!items.length) return "No items.";
  const maxName = Math.max(6, ...items.map((it) => it.name.length));
  const maxUser = Math.max(8, ...items.map((it) => it.added_by.length));
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [
    `${pad("Name", maxName)}  ${"Barcode".padEnd(14)}  ${"Qty".padEnd(5)}  ${pad("Added By", maxUser)}  Added At`,
    "─".repeat(maxName + 14 + 5 + maxUser + 30),
    ...items.map(
      (it) =>
        `${pad(it.name, maxName)}  ${(it.barcode || "—").padEnd(14)}  ${String(it.qty).padEnd(5)}  ${pad(it.added_by, maxUser)}  ${new Date(it.added_at).toLocaleString()}`
    ),
    "",
    `Total unique items: ${items.length}`,
    `Total quantity: ${items.reduce((s, it) => s + it.qty, 0)}`,
  ];
  return lines.join("\n");
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ─── Palette & styles ───────────────────────────────────────────────────
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;600&display=swap";

const P = {
  bg: "#0f1114",
  surface: "#1a1d23",
  surfaceAlt: "#22262e",
  border: "#2e333d",
  borderLight: "#3a404d",
  text: "#e8eaed",
  textDim: "#8b919e",
  accent: "#22c55e",
  accentDim: "#166534",
  accentGlow: "rgba(34,197,94,0.12)",
  danger: "#ef4444",
  dangerDim: "#7f1d1d",
  warn: "#f59e0b",
};

const S = {
  app: {
    fontFamily: "'DM Sans', sans-serif",
    background: P.bg,
    color: P.text,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: P.surface,
    borderBottom: `1px solid ${P.border}`,
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  logo: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    fontSize: 18,
    color: P.accent,
    letterSpacing: "-0.5px",
  },
  userBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: P.surfaceAlt,
    border: `1px solid ${P.border}`,
    borderRadius: 8,
    padding: "6px 14px",
    cursor: "pointer",
    color: P.textDim,
    fontSize: 14,
    transition: "border-color 0.15s",
  },
  body: {
    flex: 1,
    padding: "16px 20px",
    maxWidth: 640,
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  card: {
    background: P.surface,
    border: `1px solid ${P.border}`,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    background: P.surfaceAlt,
    border: `1px solid ${P.border}`,
    borderRadius: 10,
    color: P.text,
    fontSize: 16,
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    transition: "border-color 0.15s",
  },
  btnPrimary: {
    background: P.accent,
    color: "#0a0a0a",
    border: "none",
    borderRadius: 10,
    padding: "14px 24px",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    transition: "opacity 0.15s",
    width: "100%",
  },
  btnSecondary: {
    background: "transparent",
    color: P.textDim,
    border: `1px solid ${P.border}`,
    borderRadius: 10,
    padding: "10px 16px",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    fontSize: 14,
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: P.textDim,
    marginBottom: 8,
    display: "block",
  },
  badge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 6,
    background: P.accentDim,
    color: P.accent,
  },
};

// ────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ────────────────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin, onAddUser }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onAddUser(trimmed);
      setName("");
      setAdding(false);
    }
  };

  return (
    <div style={{ ...S.app, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <link href={FONT_LINK} rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ ...S.logo, fontSize: 28, marginBottom: 8 }}>▦ HOMINVENTORY</div>
          <div style={{ color: P.textDim, fontSize: 15 }}>Pick your name to get started</div>
        </div>
        <div style={S.card}>
          {users.length === 0 && !adding && (
            <div style={{ color: P.textDim, textAlign: "center", padding: "20px 0", fontSize: 14 }}>
              No users yet — add one below
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => (
              <button
                key={u}
                onClick={() => onLogin(u)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: P.surfaceAlt, border: `1px solid ${P.border}`,
                  borderRadius: 10, padding: "16px 18px", color: P.text,
                  fontSize: 16, fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500, cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  textAlign: "left", width: "100%", boxSizing: "border-box",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = P.accent; e.currentTarget.style.background = P.accentGlow; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.background = P.surfaceAlt; }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: P.accentDim, color: P.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 15, flexShrink: 0,
                }}>
                  {u[0].toUpperCase()}
                </span>
                {u}
              </button>
            ))}
          </div>
          {adding ? (
            <div style={{ marginTop: 12 }}>
              <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="Enter your name…" style={S.input} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={S.btnPrimary} onClick={handleAdd}>Add</button>
                <button style={{ ...S.btnSecondary, flex: "none", padding: "10px 20px" }}
                  onClick={() => { setAdding(false); setName(""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button style={{ ...S.btnSecondary, width: "100%", marginTop: 12, padding: "14px 16px" }}
              onClick={() => setAdding(true)}>+ Add new person</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ITEM ROW
// ────────────────────────────────────────────────────────────────────────
function ItemRow({ item, onQtyChange, onDelete }) {
  const qtyBtn = {
    width: 40, height: 40, borderRadius: 8,
    border: `1px solid ${P.border}`, background: P.surfaceAlt,
    color: P.text, fontSize: 20, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'JetBrains Mono', monospace", transition: "border-color 0.15s",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: `1px solid ${P.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.name}
        </div>
        {item.barcode && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: P.textDim, marginTop: 2 }}>
            {item.barcode}
          </div>
        )}
        <div style={{ fontSize: 11, color: P.textDim, marginTop: 2 }}>
          Added by {item.added_by}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <button style={qtyBtn} onClick={() => onQtyChange(item.id, -1)}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.danger)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}>−</button>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
          fontSize: 18, minWidth: 32, textAlign: "center",
          color: item.qty === 0 ? P.danger : P.text,
        }}>{item.qty}</span>
        <button style={qtyBtn} onClick={() => onQtyChange(item.id, 1)}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}>+</button>
      </div>
      <button onClick={() => onDelete(item.id)}
        style={{
          background: "none", border: "none", color: P.textDim,
          cursor: "pointer", padding: 6, fontSize: 16, lineHeight: 1,
          flexShrink: 0, borderRadius: 6, transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = P.danger)}
        onMouseLeave={(e) => (e.currentTarget.style.color = P.textDim)}
        title="Delete item">✕</button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// INVENTORY SCREEN
// ────────────────────────────────────────────────────────────────────────
function InventoryScreen({ user, items, onRefresh, onLogout }) {
  const [scanInput, setScanInput] = useState("");
  const [manualName, setManualName] = useState("");
  const [search, setSearch] = useState("");
  const [lookupStatus, setLookupStatus] = useState(null);
  const [lookupSource, setLookupSource] = useState(null);
  const [lookupChecking, setLookupChecking] = useState(null);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [pendingName, setPendingName] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportUser, setExportUser] = useState("__all__");
  const [toast, setToast] = useState(null);
  const scanRef = useRef(null);

  useEffect(() => {
    if (scanRef.current && !pendingBarcode) scanRef.current.focus();
  }, [pendingBarcode]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleScanKeyDown = async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const val = scanInput.trim();
    if (!val) return;

    const isBarcode = /^\d{4,14}$/.test(val);

    if (isBarcode) {
      // Try adding via API — it auto-increments if barcode exists
      const result = await api("items", {
        method: "POST",
        body: JSON.stringify({ name: "__pending__", barcode: val, added_by: user }),
      });

      if (result.incremented) {
        setScanInput("");
        showToast(`+1 ${result.item.name}`);
        onRefresh();
        return;
      }

      // New barcode — delete the placeholder and let user confirm name
      await api(`items?id=${result.item.id}`, { method: "DELETE" });

      setLookupStatus("looking");
      setLookupSource(null);
      setLookupChecking(null);
      setPendingBarcode(val);
      setScanInput("");
      const lookupResult = await lookupBarcode(val, (source) => setLookupChecking(source));
      if (lookupResult) {
        setPendingName(lookupResult.name);
        setLookupSource(lookupResult.source);
        setLookupStatus("found");
      } else {
        setPendingName("");
        setLookupStatus("notfound");
      }
      setLookupChecking(null);
    } else {
      await api("items", {
        method: "POST",
        body: JSON.stringify({ name: val, barcode: null, added_by: user }),
      });
      setScanInput("");
      showToast(`Added "${val}"`);
      onRefresh();
    }
  };

  const confirmPending = async () => {
    const name = pendingName.trim();
    if (!name) return;
    await api("items", {
      method: "POST",
      body: JSON.stringify({ name, barcode: pendingBarcode, added_by: user }),
    });
    showToast(`Added "${name}"`);
    setPendingBarcode(null);
    setPendingName("");
    setLookupStatus(null);
    setLookupSource(null);
    setLookupChecking(null);
    onRefresh();
  };

  const cancelPending = () => {
    setPendingBarcode(null);
    setPendingName("");
    setLookupStatus(null);
    setLookupSource(null);
    setLookupChecking(null);
  };

  const handleQtyChange = async (id, delta) => {
    await api("items", { method: "PUT", body: JSON.stringify({ id, delta }) });
    onRefresh();
  };

  const handleDelete = async (id) => {
    await api(`items?id=${id}`, { method: "DELETE" });
    onRefresh();
  };

  const handleManualAdd = async () => {
    const name = manualName.trim();
    if (!name) return;
    await api("items", {
      method: "POST",
      body: JSON.stringify({ name, barcode: null, added_by: user }),
    });
    showToast(`Added "${name}"`);
    setManualName("");
    setShowManual(false);
    onRefresh();
  };

  const itemUsers = [...new Set(items.map((it) => it.added_by))];
  const getExportItems = () =>
    exportUser === "__all__" ? items : items.filter((it) => it.added_by === exportUser);

  const handleExportCSV = () => {
    const exp = getExportItems();
    if (!exp.length) return;
    const label = exportUser === "__all__" ? "all" : exportUser.replace(/\s/g, "_");
    downloadFile(generateCSV(exp), `inventory_${label}.csv`, "text/csv;charset=utf-8");
    showToast(`Exported ${exp.length} items as CSV`);
    setShowExport(false);
  };

  const handleExportTXT = () => {
    const exp = getExportItems();
    if (!exp.length) return;
    const label = exportUser === "__all__" ? "all" : exportUser.replace(/\s/g, "_");
    downloadFile(generateTXT(exp), `inventory_${label}.txt`, "text/plain;charset=utf-8");
    showToast(`Exported ${exp.length} items as TXT`);
    setShowExport(false);
  };

  const filtered = items.filter(
    (it) =>
      it.name.toLowerCase().includes(search.toLowerCase()) ||
      (it.barcode && it.barcode.includes(search))
  );
  const totalItems = items.reduce((sum, it) => sum + it.qty, 0);

  return (
    <div style={S.app}>
      <link href={FONT_LINK} rel="stylesheet" />

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.logo}>▦ HOMINVENTORY</div>
        <button style={S.userBadge} onClick={onLogout}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%",
            background: P.accentDim, color: P.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 12,
          }}>{user[0].toUpperCase()}</span>
          {user}
          <span style={{ fontSize: 12, opacity: 0.5 }}>▾</span>
        </button>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "success" ? P.accentDim : P.dangerDim,
          color: toast.type === "success" ? P.accent : P.danger,
          padding: "10px 24px", borderRadius: 10, fontWeight: 600, fontSize: 14,
          zIndex: 100, border: `1px solid ${toast.type === "success" ? P.accent : P.danger}`,
          animation: "fadeIn 0.2s ease",
        }}>{toast.msg}</div>
      )}

      <div style={S.body}>
        {/* SCAN INPUT */}
        {!pendingBarcode && (
          <div style={{ ...S.card, background: P.accentGlow, borderColor: P.accentDim }}>
            <label style={S.label}>
              <span style={{ color: P.accent }}>⎋</span> Scan barcode or type item name
            </label>
            <input ref={scanRef} value={scanInput} onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleScanKeyDown}
              placeholder="Scan a barcode or type a name, then press Enter…"
              style={{ ...S.input, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", background: P.bg }}
              autoComplete="off" autoCorrect="off" inputMode="text" />
            <div style={{ fontSize: 12, color: P.textDim, marginTop: 8 }}>
              Numeric input → looks up books, food, movies &nbsp;|&nbsp; Text → adds as item name
            </div>
          </div>
        )}

        {/* LOOKUP PENDING */}
        {pendingBarcode && (
          <div style={{
            ...S.card,
            borderColor: lookupStatus === "looking" ? P.warn : lookupStatus === "found" ? P.accent : P.danger,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={S.badge}>{pendingBarcode}</span>
              {lookupStatus === "looking" && (
                <span style={{ color: P.warn, fontSize: 14 }}>
                  Checking {lookupChecking || "…"}
                </span>
              )}
              {lookupStatus === "found" && (
                <span style={{ color: P.accent, fontSize: 14 }}>
                  ✓ Found via {lookupSource}
                </span>
              )}
              {lookupStatus === "notfound" && (
                <span style={{ color: P.danger, fontSize: 14 }}>
                  Not found — enter name manually
                </span>
              )}
            </div>
            {lookupStatus !== "looking" && (
              <>
                <input autoFocus value={pendingName} onChange={(e) => setPendingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmPending()}
                  placeholder="Item name…" style={{ ...S.input, marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={S.btnPrimary} onClick={confirmPending}>Add to inventory</button>
                  <button style={{ ...S.btnSecondary, padding: "14px 20px" }} onClick={cancelPending}>Cancel</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* MANUAL ADD */}
        {!pendingBarcode && (
          <>
            {showManual ? (
              <div style={S.card}>
                <label style={S.label}>Add item manually</label>
                <input autoFocus value={manualName} onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualAdd()}
                  placeholder="Item description…" style={{ ...S.input, marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={S.btnPrimary} onClick={handleManualAdd}>Add</button>
                  <button style={{ ...S.btnSecondary, padding: "14px 20px" }}
                    onClick={() => { setShowManual(false); setManualName(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={{ ...S.btnSecondary, width: "100%", marginBottom: 16, padding: "12px 16px" }}
                onClick={() => setShowManual(true)}>+ Add item manually</button>
            )}
          </>
        )}

        {/* STATS + EXPORT */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: P.textDim }}>
            <strong style={{ color: P.text }}>{items.length}</strong> unique items &nbsp;·&nbsp;{" "}
            <strong style={{ color: P.text }}>{totalItems}</strong> total qty
          </div>
          {items.length > 0 && (
            <button style={{ ...S.btnSecondary, padding: "6px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setShowExport((v) => !v)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}>
              ↓ Export
            </button>
          )}
        </div>

        {/* EXPORT PANEL */}
        {showExport && (
          <div style={{ ...S.card, marginBottom: 12, borderColor: P.borderLight }}>
            <label style={S.label}>Export inventory</label>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: P.textDim, marginBottom: 6 }}>Filter by user</div>
              <select value={exportUser} onChange={(e) => setExportUser(e.target.value)}
                style={{ ...S.input, padding: "10px 14px", fontSize: 14, cursor: "pointer", appearance: "auto" }}>
                <option value="__all__">All users ({items.length} items)</option>
                {itemUsers.map((u) => {
                  const count = items.filter((it) => it.added_by === u).length;
                  return <option key={u} value={u}>{u} ({count} items)</option>;
                })}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...S.btnPrimary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={handleExportCSV}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>CSV</span>
                Download
              </button>
              <button style={{ ...S.btnSecondary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px" }}
                onClick={handleExportTXT}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, background: P.surfaceAlt, padding: "2px 6px", borderRadius: 4 }}>TXT</span>
                Download
              </button>
            </div>
          </div>
        )}

        {/* SEARCH */}
        {items.length > 3 && (
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inventory…"
            style={{ ...S.input, marginBottom: 12, fontSize: 14 }} />
        )}

        {/* ITEM LIST */}
        <div style={S.card}>
          {filtered.length === 0 ? (
            <div style={{ color: P.textDim, textAlign: "center", padding: "32px 0", fontSize: 14 }}>
              {items.length === 0 ? "No items yet — scan a barcode to get started" : "No matching items"}
            </div>
          ) : (
            <div>
              {filtered.map((item) => (
                <ItemRow key={item.id} item={item} onQtyChange={handleQtyChange} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        * { -webkit-tap-highlight-color: transparent; }
        input::placeholder { color: ${P.textDim}; opacity: 0.6; }
        input:focus { border-color: ${P.accent} !important; box-shadow: 0 0 0 3px ${P.accentGlow} !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${P.border}; border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// APP ROOT
// ────────────────────────────────────────────────────────────────────────
export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const fetchAll = async () => {
    const [u, i] = await Promise.all([api("users"), api("items")]);
    setUsers(u);
    setItems(i);
    setLoaded(true);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleAddUser = async (name) => {
    await api("users", { method: "POST", body: JSON.stringify({ name }) });
    await fetchAll();
  };

  if (!loaded) {
    return (
      <div style={{ ...S.app, justifyContent: "center", alignItems: "center" }}>
        <link href={FONT_LINK} rel="stylesheet" />
        <div style={{ ...S.logo, fontSize: 22 }}>▦ HOMINVENTORY</div>
        <div style={{ color: P.textDim, marginTop: 8 }}>Loading…</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen users={users} onLogin={setCurrentUser} onAddUser={handleAddUser} />;
  }

  return (
    <InventoryScreen
      user={currentUser}
      items={items}
      onRefresh={fetchAll}
      onLogout={() => setCurrentUser(null)}
    />
  );
}
