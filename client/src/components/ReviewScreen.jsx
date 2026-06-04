import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, ChevronLeft, Send, Search, X, CheckCircle } from "lucide-react";
import { pushToTally, getTallyConfig } from "../utils/api.js";

// ─────────────────────────────────────────────────────────────────────────────
// LedgerSearch — inline component (no extra file needed)
// Queries GET /api/tally/ledgers?search=...&company=...
// On pick → calls onSelect({ name, gstin, pan, address, stateName, stateCode })
// ─────────────────────────────────────────────────────────────────────────────
function LedgerSearch({ tallyCompany, onSelect, currentName }) {
    const [query,    setQuery]    = useState("");
    const [results,  setResults]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [err,      setErr]      = useState("");
    const [open,     setOpen]     = useState(false);
    const [hovered,  setHovered]  = useState(-1);

    const containerRef = useRef(null);
    const inputRef     = useRef(null);
    const timerRef     = useRef(null);

    // Close on outside click
    useEffect(() => {
        const fn = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener("mousedown", fn);
        return () => document.removeEventListener("mousedown", fn);
    }, []);

    const doSearch = useCallback(async (q) => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        setLoading(true); setErr("");
        try {
            const p = new URLSearchParams({ search: q, limit: "15" });
            if (tallyCompany) p.set("company", tallyCompany);
            const res  = await fetch(`/api/tally/ledgers?${p}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Search failed");
            setResults(json.ledgers || []);
            setOpen(true);
            setHovered(-1);
        } catch (e) {
            setErr(e.message);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [tallyCompany]);

    const handleChange = (e) => {
        const q = e.target.value;
        setQuery(q);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => doSearch(q), 350);
    };

    const handleSelect = (l) => {
        onSelect(l);
        setQuery("");
        setResults([]);
        setOpen(false);
    };

    const handleKey = (e) => {
        if (!open) return;
        if (e.key === "ArrowDown")  { e.preventDefault(); setHovered(h => Math.min(h + 1, results.length - 1)); }
        if (e.key === "ArrowUp")    { e.preventDefault(); setHovered(h => Math.max(h - 1, 0)); }
        if (e.key === "Enter" && hovered >= 0) { e.preventDefault(); handleSelect(results[hovered]); }
        if (e.key === "Escape")     { setOpen(false); }
    };

    return (
        <div ref={containerRef} style={{ position: "relative" }}>
            {/* Search input */}
            <div style={{ position: "relative" }}>
                <Search size={12} style={{
                    position: "absolute", left: 9, top: "50%",
                    transform: "translateY(-50%)", color: "var(--text-muted)",
                    pointerEvents: "none",
                }} />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKey}
                    placeholder={currentName ? `Override: search Tally ledgers…` : "Search Tally ledgers…"}
                    style={{
                        width:        "100%",
                        boxSizing:    "border-box",
                        background:   "var(--bg-input)",
                        border:       "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding:      "7px 10px 7px 28px",
                        color:        "var(--text)",
                        fontSize:     12,
                        fontFamily:   "var(--font)",
                        outline:      "none",
                        transition:   "border-color var(--transition)",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--border-focus)"; if (results.length && query.length >= 2) setOpen(true); }}
                    onBlur={(e)  => e.target.style.borderColor = "var(--border)"}
                />
                {query && (
                    <button onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
                            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--text-muted)", padding: 2, display: "flex" }}>
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Status line */}
            {(loading || err) && (
                <div style={{ fontSize: 11, color: err ? "var(--danger)" : "var(--text-muted)", marginTop: 4 }}>
                    {loading ? "Searching Tally…" : `⚠ ${err}`}
                </div>
            )}

            {/* Dropdown */}
            {open && results.length > 0 && (
                <div style={{
                    position:     "absolute",
                    top:          "calc(100% + 4px)",
                    left:         0,
                    right:        0,
                    zIndex:       9999,
                    background:   "var(--bg-card)",
                    border:       "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    boxShadow:    "0 8px 24px rgba(0,0,0,0.18)",
                    maxHeight:    300,
                    overflowY:    "auto",
                }}>
                    {results.map((l, i) => (
                        <div key={l.name}
                             onMouseDown={() => handleSelect(l)}
                             onMouseEnter={() => setHovered(i)}
                             style={{
                                 padding:      "10px 14px",
                                 cursor:       "pointer",
                                 borderBottom: "1px solid var(--border)",
                                 background:   i === hovered ? "var(--bg-hover)" : "transparent",
                                 transition:   "background 0.1s",
                             }}
                        >
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 3 }}>
                                {l.name}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {l.gstin && (
                                    <span style={{
                                        fontSize: 11, fontFamily: "var(--font-mono)",
                                        background: "var(--accent-soft, rgba(99,102,241,0.1))",
                                        color: "var(--accent)", borderRadius: 3, padding: "1px 6px",
                                    }}>
                                        {l.gstin}
                                    </span>
                                )}
                                {l.stateName && (
                                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                        {l.stateName}
                                    </span>
                                )}
                                {l.parentGroup && (
                                    <span style={{ fontSize: 11, color: "var(--text-dim, var(--text-muted))", opacity: 0.7 }}>
                                        {l.parentGroup}
                                    </span>
                                )}
                            </div>
                            {l.address && (
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                    {l.address.length > 90 ? l.address.slice(0, 90) + "…" : l.address}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PartySection — renders the Bill To / Ship To / Supplier card.
// Shows editable fields PLUS the LedgerSearch bar above them.
// Selecting a ledger auto-fills all fields AND visually confirms the pick.
// ─────────────────────────────────────────────────────────────────────────────
function PartySection({ title, party, partyKey, delay, tallyCompany, onLedgerPick, onFieldChange }) {
    const [justPicked, setJustPicked] = useState(false);

    const handlePick = (ledger) => {
        onLedgerPick(partyKey, ledger);
        setJustPicked(true);
        setTimeout(() => setJustPicked(false), 2500);
    };

    const hasParty = !!(party?.partyName || party?.name);

    return (
        <div style={{
            background:   "var(--bg-card)",
            border:       `1px solid ${justPicked ? "rgba(34,197,94,0.5)" : !hasParty ? "rgba(245,158,11,0.35)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            padding:      24,
            transition:   "border-color 0.4s",
        }}>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h3 style={{
                    fontSize: 12, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: "var(--text-muted)", margin: 0,
                }}>{title}</h3>
                {justPicked && (
                    <span style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 11, color: "#16a34a", fontWeight: 600,
                    }}>
                        <CheckCircle size={12} /> Filled from Tally
                    </span>
                )}
                {!hasParty && !justPicked && (
                    <span style={{ fontSize: 11, color: "var(--warn)", fontWeight: 500 }}>
                        ⚠ Search &amp; select a party
                    </span>
                )}
            </div>

            {/* Ledger search bar */}
            <div style={{ marginBottom: 12 }}>
                <LedgerSearch
                    tallyCompany={tallyCompany}
                    currentName={party?.partyName || party?.name}
                    onSelect={handlePick}
                />
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", marginBottom: 12 }} />

            {/* Empty state — shown until a ledger is picked */}
            {!hasParty ? (
                <div style={{
                    padding: "18px 0",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 12,
                }}>
                    Search above to select a party from Tally
                </div>
            ) : (
                /* Editable fields — shown after a ledger is picked */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <FieldInline
                        label="Name"
                        value={party?.partyName || party?.name || ""}
                        onChange={(v) => onFieldChange(partyKey, partyKey === "supplier" ? "name" : "partyName", v)}
                    />
                    <FieldInline
                        label="GSTIN"
                        value={party?.gstin || ""}
                        onChange={(v) => onFieldChange(partyKey, "gstin", v)}
                        mono
                        warn={!party?.gstin}
                    />
                    <FieldInline
                        label="PAN"
                        value={party?.pan || ""}
                        onChange={(v) => onFieldChange(partyKey, "pan", v)}
                        mono
                    />
                    <FieldInline
                        label="State"
                        value={party?.stateName || ""}
                        onChange={(v) => onFieldChange(partyKey, "stateName", v)}
                    />
                    <FieldInline
                        label="Address"
                        value={party?.address || ""}
                        onChange={(v) => onFieldChange(partyKey, "address", v)}
                        multiline
                    />
                    {partyKey === "billTo" && (
                        <FieldInline
                            label="Email"
                            value={party?.email || ""}
                            onChange={(v) => onFieldChange(partyKey, "email", v)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldInline — same spirit as Field but supports multiline (textarea)
// ─────────────────────────────────────────────────────────────────────────────
function FieldInline({ label, value, onChange, mono, warn, multiline }) {
    const base = {
        background:   warn ? "var(--warn-soft)" : "var(--bg-input)",
        border:       `1px solid ${warn ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        padding:      "7px 10px",
        color:        "var(--text)",
        fontSize:     13,
        fontFamily:   mono ? "var(--font-mono)" : "var(--font)",
        outline:      "none",
        transition:   "border-color var(--transition)",
        width:        "100%",
        boxSizing:    "border-box",
        resize:       "none",
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{
                fontSize: 11, fontWeight: 500, color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{label}</label>
            {multiline ? (
                <textarea
                    rows={2}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    style={base}
                    onFocus={(e) => e.target.style.borderColor = "var(--border-focus)"}
                    onBlur={(e)  => e.target.style.borderColor = warn ? "rgba(245,158,11,0.4)" : "var(--border)"}
                />
            ) : (
                <input
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    style={base}
                    onFocus={(e) => e.target.style.borderColor = "var(--border-focus)"}
                    onBlur={(e)  => e.target.style.borderColor = warn ? "rgba(245,158,11,0.4)" : "var(--border)"}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Original Field (kept for PO header section)
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, mono, warn }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
            </label>
            <input
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    background:   warn ? "var(--warn-soft)" : "var(--bg-input)",
                    border:       `1px solid ${warn ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)",
                    padding:      "7px 10px",
                    color:        "var(--text)",
                    fontSize:     13,
                    fontFamily:   mono ? "var(--font-mono)" : "var(--font)",
                    outline:      "none",
                    transition:   "border-color var(--transition)",
                    width:        "100%",
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--border-focus)"}
                onBlur={(e)  => e.target.style.borderColor = warn ? "rgba(245,158,11,0.4)" : "var(--border)"}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section — generic card wrapper (used for non-party sections)
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children, delay = 0 }) {
    return (
        <div className="fade-up" style={{
            background:   "var(--bg-card)",
            border:       "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding:      24,
            animationDelay: `${delay}s`,
        }}>
            <h3 style={{
                fontSize: 12, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: "var(--text-muted)", marginBottom: 16,
            }}>{title}</h3>
            {children}
        </div>
    );
}

function Grid({ cols = 2, children }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReviewScreen
// ─────────────────────────────────────────────────────────────────────────────
// Clears all party fields so the user must search and select from Tally ledgers.
// We keep the structure intact (so downstream code never hits undefined) but
// wipe every human-facing value to an empty string.
function blankParty(party) {
    if (!party) return {};
    const blanked = { ...party };
    ["partyName","name","gstin","pan","address","stateName","stateCode","email","mailingName"].forEach(
        (k) => { blanked[k] = ""; }
    );
    return blanked;
}

export default function ReviewScreen({ data: initialData, onPushed, onBack }) {
    // Blank all three party sections — user must pick from Tally ledger search
    const cleanedInitial = (() => {
        const d = JSON.parse(JSON.stringify(initialData));
        // billTo is pre-populated from the PDF (hardcoded in parseSalesforcePO) — keep it,
        // user can override by searching. shipTo and supplier must be selected from Tally.
        d.shipTo   = blankParty(d.shipTo);
        d.supplier = blankParty(d.supplier);
        return d;
    })();
    const [data,         setData]         = useState(cleanedInitial);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState("");
    const [tallyCompany, setTallyCompany] = useState("");
    const [configLoaded, setConfigLoaded] = useState(false);

    const warnings     = data.validation?.warnings || [];
    const isVoucherValid = !!(data.header?.voucherNo && data.header.voucherNo.trim() !== "");
    const canPush      = !loading && isVoucherValid;

    useEffect(() => {
        getTallyConfig()
            .then((cfg) => { setTallyCompany(cfg.tallyCompany || ""); setConfigLoaded(true); })
            .catch(() => setConfigLoaded(true));
    }, []);

    // ── Generic deep-path setter ────────────────────────────────────────────
    function set(path, value) {
        setData((prev) => {
            const next  = JSON.parse(JSON.stringify(prev));
            const parts = path.split(".");
            let obj     = next;
            for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
            obj[parts[parts.length - 1]] = value;
            return next;
        });
    }

    // ── Per-field change inside a party object ──────────────────────────────
    function handleFieldChange(partyKey, field, value) {
        setData((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            next[partyKey][field] = value;
            return next;
        });
    }

    // ── Ledger picked from dropdown → patch entire party block ─────────────
    // Maps the Tally ledger fields onto the correct keys for each party type.
    // This is what makes "Push to Tally" send the right data.
    function handleLedgerPick(partyKey, ledger) {
        setData((prev) => {
            const next  = JSON.parse(JSON.stringify(prev));
            const party = next[partyKey];

            // Name key differs between billTo/shipTo (partyName) and supplier (name)
            if (partyKey === "supplier") {
                party.name = ledger.name;
            } else {
                party.partyName = ledger.name;
            }

            // Overwrite all fields from the selected ledger — no fallback to stale values
            party.gstin     = ledger.gstin     ?? "";
            party.pan       = ledger.pan       ?? "";
            party.address   = ledger.address   ?? "";
            party.stateName = ledger.stateName ?? "";
            party.stateCode = ledger.stateCode ?? "";

            // For supplier, also update mailingName (used in XML)
            if (partyKey === "supplier") {
                party.mailingName = ledger.name;
            }

            // When Ship To is selected, set destination to just the party name (short label)
            // The full address goes into CONSIGNEEADDRESS/BASICSHIPADDR fields, not Destination
            if (partyKey === "shipTo") {
                next.header.destination = ledger.name ?? "";
            }

            return next;
        });
    }

    // ── Line items ──────────────────────────────────────────────────────────
    function setLine(index, field, value) {
        setData((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            next.lineItems[index][field] = (field === "quantityKg" || field === "ratePerKg" || field === "amount")
                ? parseFloat(value) || 0
                : value;
            if (field === "quantityKg" || field === "ratePerKg") {
                next.lineItems[index].amount =
                    Math.round(next.lineItems[index].quantityKg * next.lineItems[index].ratePerKg * 100) / 100;
            }
            const base = next.lineItems.reduce((s, i) => s + i.amount, 0);
            next.totals.baseAmount = Math.round(base * 100) / 100;
            next.totals.taxAmount  = Math.round(base * (next.totals.gstRatePct / 100) * 100) / 100;
            next.totals.grandTotal = Math.round((next.totals.baseAmount + next.totals.taxAmount) * 100) / 100;
            return next;
        });
    }

    // ── GST rate ────────────────────────────────────────────────────────────
    function setGstRate(rawValue) {
        const pct = parseFloat(rawValue);
        setData((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            next.totals.gstRatePct = isNaN(pct) ? prev.totals.gstRatePct : pct;
            const rate = next.totals.gstRatePct / 100;
            next.totals.taxAmount  = Math.round(next.totals.baseAmount * rate * 100) / 100;
            next.totals.grandTotal = Math.round((next.totals.baseAmount + next.totals.taxAmount) * 100) / 100;
            return next;
        });
    }

    // ── Push ────────────────────────────────────────────────────────────────
    async function handlePush() {
        if (!canPush) return;
        setLoading(true); setError("");
        try {
            const result = await pushToTally(data, tallyCompany || undefined);
            onPushed(result);
        } catch (err) {
            setError(err.response?.data?.error || err.message || "Failed to push to Tally.");
        } finally {
            setLoading(false);
        }
    }

    const fmt = (n) => typeof n === "number"
        ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        : n;

    return (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>

            {/* Header row */}
            <div className="fade-up" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <button onClick={onBack} style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 13,
                            padding: 0, fontFamily: "var(--font)",
                        }}>
                            <ChevronLeft size={14} /> Back
                        </button>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                        Review Extracted Data
                    </h2>
                    <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 3 }}>
                        PO {data.meta?.sfPONumber} · Voucher {data.header?.voucherNo || "Pending"}
                    </p>
                </div>

                <button
                    onClick={handlePush}
                    disabled={!canPush}
                    style={{
                        display:      "flex", alignItems: "center", gap: 8,
                        padding:      "10px 22px",
                        background:   canPush ? "var(--accent)" : "var(--bg-hover)",
                        color:        canPush ? "#fff" : "var(--text-dim)",
                        border:       "none",
                        borderRadius: "var(--radius)",
                        fontSize:     14, fontWeight: 600,
                        cursor:       loading ? "wait" : (canPush ? "pointer" : "not-allowed"),
                        fontFamily:   "var(--font)",
                        opacity:      loading ? 0.7 : (!canPush ? 0.6 : 1),
                        transition:   "all var(--transition)",
                    }}
                >
                    {loading ? (
                        <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    ) : <Send size={14} color={canPush ? "#fff" : "var(--text-dim)"} />}
                    {loading ? "Pushing to Tally…" : "Push to Tally"}
                </button>
            </div>

            {/* Validation warnings */}
            {warnings.length > 0 && (
                <div className="fade-up fade-up-1" style={{
                    background:   "var(--warn-soft)",
                    border:       "1px solid rgba(245,158,11,0.3)",
                    borderRadius: "var(--radius)",
                    padding:      "14px 16px",
                    marginBottom: 20,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--warn)", fontWeight: 600, fontSize: 13 }}>
                        <AlertTriangle size={14} /> {warnings.length} validation warning{warnings.length > 1 ? "s" : ""}
                    </div>
                    {warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#c8870a", paddingLeft: 22, lineHeight: 1.8 }}>• {w}</div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    background: "var(--danger-soft)", border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: "var(--radius-sm)", padding: "12px 16px", marginBottom: 20,
                    color: "var(--danger)", fontSize: 13,
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* ── PO Header ── */}
                <Section title="Purchase Order Header" delay={0.05}>
                    <Grid cols={3}>
                        <Field label="Voucher No. *" value={data.header?.voucherNo}    onChange={(v) => set("header.voucherNo", v)}    mono warn={!data.header?.voucherNo} />
                        <Field label="SF PO Ref"     value={data.header?.sfPORef}      onChange={(v) => set("header.sfPORef", v)}      mono />
                        <Field label="Date"          value={data.header?.date}         onChange={(v) => set("header.date", v)} />
                        <Field label="Delivery Date" value={data.header?.deliveryDate} onChange={(v) => set("header.deliveryDate", v)} />
                        <Field label="Destination"   value={data.header?.destination}  onChange={(v) => set("header.destination", v)} />
                        <Field label="Payment Terms" value={data.header?.paymentTerms} onChange={(v) => set("header.paymentTerms", v)} warn={!data.header?.paymentTerms} />
                    </Grid>
                </Section>

                {/* ── Party sections: Bill To + Ship To side-by-side ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <PartySection
                        title="Bill To (Vendor)"
                        party={data.billTo}
                        partyKey="billTo"
                        delay={0.08}
                        tallyCompany={tallyCompany}
                        onLedgerPick={handleLedgerPick}
                        onFieldChange={handleFieldChange}
                    />
                    <PartySection
                        title="Ship To (Consignee)"
                        party={data.shipTo}
                        partyKey="shipTo"
                        delay={0.10}
                        tallyCompany={tallyCompany}
                        onLedgerPick={handleLedgerPick}
                        onFieldChange={handleFieldChange}
                    />
                </div>

                {/* ── Supplier (full width) ── */}
                <PartySection
                    title="Supplier (Bill From)"
                    party={data.supplier}
                    partyKey="supplier"
                    delay={0.11}
                    tallyCompany={tallyCompany}
                    onLedgerPick={handleLedgerPick}
                    onFieldChange={handleFieldChange}
                />

                {/* ── Line Items ── */}
                <Section title={`Line Items (${data.lineItems?.length || 0})`} delay={0.12}>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                {["Line", "Description", "HSN", "Qty (Kgs)", "Rate/Kg", "Amount"].map((h) => (
                                    <th key={h} style={{
                                        textAlign: "left", padding: "6px 10px",
                                        fontSize: 11, fontWeight: 600,
                                        color: "var(--text-muted)", textTransform: "uppercase",
                                        letterSpacing: "0.06em", whiteSpace: "nowrap",
                                    }}>{h}</th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {(data.lineItems || []).map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{item.fullLineRef}</td>
                                    <td style={{ padding: "8px 10px", minWidth: 200 }}>
                                        <input
                                            value={item.description ?? ""}
                                            onChange={(e) => setLine(idx, "description", e.target.value)}
                                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "5px 8px", color: "var(--text)", fontSize: 12, width: "100%", fontFamily: "var(--font)", outline: "none" }}
                                        />
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>
                                        <input
                                            value={item.hsnCode ?? ""}
                                            onChange={(e) => setLine(idx, "hsnCode", e.target.value)}
                                            style={{ background: "var(--bg-input)", border: `1px solid ${!item.hsnCode ? "rgba(245,158,11,0.4)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", padding: "5px 8px", color: "var(--text)", fontSize: 12, width: 90, fontFamily: "var(--font-mono)", outline: "none" }}
                                        />
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>
                                        <input
                                            type="number"
                                            value={item.quantityKg ?? ""}
                                            onChange={(e) => setLine(idx, "quantityKg", e.target.value)}
                                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "5px 8px", color: "var(--text)", fontSize: 12, width: 90, fontFamily: "var(--font-mono)", outline: "none" }}
                                        />
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <input
                                                type="number"
                                                value={item.ratePerKg ?? ""}
                                                onChange={(e) => setLine(idx, "ratePerKg", e.target.value)}
                                                style={{ background: item.rateMatches === false ? "var(--warn-soft)" : "var(--bg-input)", border: `1px solid ${item.rateMatches === false ? "rgba(245,158,11,0.4)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", padding: "5px 8px", color: "var(--text)", fontSize: 12, width: 80, fontFamily: "var(--font-mono)", outline: "none" }}
                                            />
                                            {item.rateMatches === false && (
                                                <span title={`Email PO rate: ₹${item.rateEmailPO}`} style={{ fontSize: 11, color: "var(--warn)", cursor: "help" }}>⚠</span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>
                                        {fmt(item.amount)}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                {/* ── Totals ── */}
                <Section title="Totals" delay={0.15}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ minWidth: 300 }}>
                            {[
                                ["Base Amount",  fmt(data.totals?.baseAmount),  false],
                                [`${data.totals?.gstType || "GST"} @ ${data.totals?.gstRatePct ?? 18}%`, fmt(data.totals?.taxAmount), false],
                                ["Grand Total",  fmt(data.totals?.grandTotal),  true],
                            ].map(([label, value, bold]) => (
                                <div key={label} style={{
                                    display: "flex", justifyContent: "space-between",
                                    padding: "8px 0",
                                    borderTop: bold ? "1px solid var(--border)" : "none",
                                    marginTop: bold ? 4 : 0,
                                }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</span>
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400 }}>{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>

                {/* ── Tally Settings ── */}
                <Section title="Tally Settings" delay={0.18}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Tally Company Name
                            </label>
                            <input
                                value={tallyCompany}
                                onChange={(e) => setTallyCompany(e.target.value)}
                                placeholder={configLoaded ? "Enter exact company name from TallyPrime title bar" : "Loading…"}
                                disabled={!configLoaded}
                                style={{
                                    background:   "var(--bg-input)",
                                    border:       `1px solid ${!tallyCompany && configLoaded ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
                                    borderRadius: "var(--radius-sm)",
                                    padding:      "7px 10px",
                                    color:        "var(--text)",
                                    fontSize:     13,
                                    fontFamily:   "var(--font-mono)",
                                    outline:      "none",
                                    width:        "100%",
                                    transition:   "border-color var(--transition)",
                                    opacity:      configLoaded ? 1 : 0.5,
                                    boxSizing:    "border-box",
                                }}
                                onFocus={(e) => e.target.style.borderColor = "var(--border-focus)"}
                                onBlur={(e)  => e.target.style.borderColor = !tallyCompany ? "rgba(245,158,11,0.4)" : "var(--border)"}
                            />
                            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                Must match exactly what appears in TallyPrime's title bar. Pre-filled from your <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>.env</code> — edit here to override for this push only.
                            </p>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                GST Rate (%)
                            </label>
                            <input
                                type="number"
                                min="0" max="100" step="0.1"
                                value={data.totals?.gstRatePct ?? 12}
                                onChange={(e) => setGstRate(e.target.value)}
                                style={{
                                    background:   "var(--bg-input)",
                                    border:       "1px solid var(--border)",
                                    borderRadius: "var(--radius-sm)",
                                    padding:      "7px 10px",
                                    color:        "var(--text)",
                                    fontSize:     13,
                                    fontFamily:   "var(--font-mono)",
                                    outline:      "none",
                                    width:        "100%",
                                    boxSizing:    "border-box",
                                    transition:   "border-color var(--transition)",
                                }}
                                onFocus={(e) => e.target.style.borderColor = "var(--border-focus)"}
                                onBlur={(e)  => e.target.style.borderColor = "var(--border)"}
                            />
                            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                Recalculates GST amount and Grand Total instantly. Common rates: 12%, 18%.
                            </p>
                        </div>

                    </div>
                </Section>

            </div>
        </div>
    );
}