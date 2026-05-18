import React from "react";
import { CheckCircle, XCircle, RefreshCw, FileText } from "lucide-react";

export default function ResultScreen({ result, poData, onReset }) {
  const success = result?.success;
  const fmt = (n) =>
    typeof n === "number"
      ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      : n;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>

      {/* Icon */}
      <div className="fade-up" style={{
        width:  72, height: 72,
        borderRadius: "50%",
        background:   success ? "var(--success-soft)" : "var(--danger-soft)",
        border:       `1px solid ${success ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
        display:      "flex", alignItems: "center", justifyContent: "center",
        margin:       "0 auto 24px",
      }}>
        {success
          ? <CheckCircle size={32} color="var(--success)" />
          : <XCircle    size={32} color="var(--danger)"  />}
      </div>

      {/* Heading */}
      <div className="fade-up fade-up-1">
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          {success ? "Voucher Created" : "Push Failed"}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
          {success
            ? result.message
            : result.error || "An error occurred while pushing to Tally."}
        </p>
      </div>

      {/* Details card */}
      {success && (
        <div className="fade-up fade-up-2" style={{
          background:   "var(--bg-card)",
          border:       "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding:      "20px 24px",
          margin:       "28px 0",
          textAlign:    "left",
        }}>
          {[
            ["Voucher No.",   result.voucherNo  || poData?.header?.voucherNo],
            ["SF PO Ref",     result.sfPONumber || poData?.meta?.sfPONumber],
            ["Grand Total",   fmt(result.grandTotal || poData?.totals?.grandTotal)],
            ["Company",       "Bluecoast Meridian"],
            ["Pushed At",     new Date().toLocaleString("en-IN")],
          ].map(([label, value]) => (
            <div key={label} style={{
              display:       "flex",
              justifyContent:"space-between",
              alignItems:    "center",
              padding:       "8px 0",
              borderBottom:  "1px solid var(--border)",
              fontSize:      13,
            }}>
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error details */}
      {!success && result.error && (
        <div className="fade-up fade-up-2" style={{
          background:   "var(--danger-soft)",
          border:       "1px solid rgba(239,68,68,0.3)",
          borderRadius: "var(--radius)",
          padding:      "16px 20px",
          margin:       "20px 0",
          textAlign:    "left",
          fontSize:     13,
          color:        "var(--danger)",
          fontFamily:   "var(--font-mono)",
          whiteSpace:   "pre-wrap",
          wordBreak:    "break-word",
        }}>
          {result.error}
        </div>
      )}

      {/* Actions */}
      <div className="fade-up fade-up-3" style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
        <button
          onClick={onReset}
          style={{
            display:      "flex", alignItems: "center", gap: 8,
            padding:      "10px 22px",
            background:   success ? "var(--accent)" : "var(--bg-card)",
            color:        success ? "#fff" : "var(--text)",
            border:       success ? "none" : "1px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize:     14, fontWeight: 600,
            cursor:       "pointer",
            fontFamily:   "var(--font)",
          }}
        >
          <RefreshCw size={14} />
          Process Another PO
        </button>
      </div>

    </div>
  );
}
