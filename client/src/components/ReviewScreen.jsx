import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, ChevronLeft, Send, Settings } from "lucide-react";
import { pushToTally, getTallyConfig } from "../utils/api.js";

// ── Tiny reusable field ────────────────────────────────────────────────────────
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

// ── Section card ────────────────────────────────────────────────────────────
function Section({ title, children, delay = 0 }) {
    return (
        <div className={`fade-up`} style={{
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

// ── Two-column grid ─────────────────────────────────────────────────────────
function Grid({ cols = 2, children }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {children}
        </div>
    );
}

export default function ReviewScreen({ data: initialData, onPushed, onBack }) {
    // Deep-clone so edits don't mutate original
    const [data,         setData]         = useState(JSON.parse(JSON.stringify(initialData)));
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState("");
    const [tallyCompany, setTallyCompany] = useState("");
    const [configLoaded, setConfigLoaded] = useState(false);

    const warnings = data.validation?.warnings || [];

    // Logic to enforce mandatory Voucher No.
    const isVoucherValid = !!(data.header?.voucherNo && data.header.voucherNo.trim() !== "");
    const canPush = !loading && isVoucherValid;

    // Pre-fill Tally company from server config on mount
    useEffect(() => {
        getTallyConfig()
            .then((cfg) => {
                setTallyCompany(cfg.tallyCompany || "");
                setConfigLoaded(true);
            })
            .catch(() => setConfigLoaded(true)); // fallback: let user type manually
    }, []);

    // ── Generic deep setter ─────────────────────────────────────────────────
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

    // ── Line item setter ────────────────────────────────────────────────────
    function setLine(index, field, value) {
        setData((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            next.lineItems[index][field] = field === "quantityKg" || field === "ratePerKg" || field === "amount"
                ? parseFloat(value) || 0
                : value;
            // Recalculate amount when qty or rate changes
            if (field === "quantityKg" || field === "ratePerKg") {
                next.lineItems[index].amount =
                    Math.round(next.lineItems[index].quantityKg * next.lineItems[index].ratePerKg * 100) / 100;
            }
            // Recalculate totals
            const base = next.lineItems.reduce((s, i) => s + i.amount, 0);
            next.totals.baseAmount = Math.round(base * 100) / 100;
            next.totals.taxAmount  = Math.round(base * (next.totals.gstRatePct / 100) * 100) / 100;
            next.totals.grandTotal = Math.round((next.totals.baseAmount + next.totals.taxAmount) * 100) / 100;
            return next;
        });
    }

    async function handlePush() {
        if (!canPush) return;
        setLoading(true);
        setError("");
        try {
            const result = await pushToTally(data, tallyCompany || undefined);
            onPushed(result);
        } catch (err) {
            setError(err.response?.data?.error || err.message || "Failed to push to Tally.");
        } finally {
            setLoading(false);
        }
    }

    const fmt = (n) => typeof n === "number" ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : n;

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

                {/* Dynamically Styled Push Button */}
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

                {/* Header Section */}
                <Section title="Purchase Order Header" delay={0.05}>
                    <Grid cols={3}>
                        <Field
                            label="Voucher No. *"
                            value={data.header?.voucherNo}
                            onChange={(v) => set("header.voucherNo", v)}
                            mono
                            warn={!data.header?.voucherNo}
                        />
                        <Field
                            label="SF PO Ref"
                            value={data.header?.sfPORef}
                            onChange={(v) => set("header.sfPORef", v)}
                            mono
                        />
                        <Field
                            label="Date"
                            value={data.header?.date}
                            onChange={(v) => set("header.date", v)}
                        />
                        <Field
                            label="Delivery Date"
                            value={data.header?.deliveryDate}
                            onChange={(v) => set("header.deliveryDate", v)}
                        />
                        <Field
                            label="Destination"
                            value={data.header?.destination}
                            onChange={(v) => set("header.destination", v)}
                        />
                        <Field
                            label="Payment Terms"
                            value={data.header?.paymentTerms}
                            onChange={(v) => set("header.paymentTerms", v)}
                            warn={!data.header?.paymentTerms}
                        />
                    </Grid>
                </Section>

                {/* Bill To + Ship To */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <Section title="Bill To (Vendor)" delay={0.08}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <Field label="Party Name" value={data.billTo?.partyName}  onChange={(v) => set("billTo.partyName", v)} />
                            <Field label="GSTIN"      value={data.billTo?.gstin}      onChange={(v) => set("billTo.gstin", v)}     mono warn={!data.billTo?.gstin} />
                            <Field label="PAN"        value={data.billTo?.pan}        onChange={(v) => set("billTo.pan", v)}       mono />
                            <Field label="State"      value={data.billTo?.stateName}  onChange={(v) => set("billTo.stateName", v)} />
                            <Field label="Email"      value={data.billTo?.email}      onChange={(v) => set("billTo.email", v)} />
                        </div>
                    </Section>

                    <Section title="Ship To (Consignee)" delay={0.10}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <Field label="Party Name" value={data.shipTo?.partyName}  onChange={(v) => set("shipTo.partyName", v)} />
                            <Field label="GSTIN"      value={data.shipTo?.gstin}      onChange={(v) => set("shipTo.gstin", v)}     mono warn={!data.shipTo?.gstin} />
                            <Field label="PAN"        value={data.shipTo?.pan}        onChange={(v) => set("shipTo.pan", v)}       mono />
                            <Field label="State"      value={data.shipTo?.stateName}  onChange={(v) => set("shipTo.stateName", v)} />
                        </div>
                    </Section>
                </div>

                {/* Line Items */}
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

                {/* Totals */}
                <Section title="Totals" delay={0.15}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ minWidth: 280 }}>
                            {[
                                ["Base Amount",  fmt(data.totals?.baseAmount),  false],
                                [`${data.totals?.gstType || "GST"} @ ${data.totals?.gstRatePct || 18}%`, fmt(data.totals?.taxAmount), false],
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

                {/* Tally Settings */}
                <Section title="Tally Settings" delay={0.18}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{
                            fontSize: 11, fontWeight: 500,
                            color: "var(--text-muted)",
                            textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>
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
                                maxWidth:     360,
                                transition:   "border-color var(--transition)",
                                opacity:      configLoaded ? 1 : 0.5,
                            }}
                            onFocus={(e) => e.target.style.borderColor = "var(--border-focus)"}
                            onBlur={(e)  => e.target.style.borderColor = !tallyCompany ? "rgba(245,158,11,0.4)" : "var(--border)"}
                        />
                        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            Must match exactly what appears in TallyPrime's title bar. Pre-filled from your <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>.env</code> — edit here to override for this push only.
                        </p>
                    </div>
                </Section>

            </div>
        </div>
    );
}