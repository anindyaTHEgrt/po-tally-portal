import React, { useState, useEffect } from "react";
import { checkTallyStatus } from "../utils/api.js";

export default function TallyStatus() {
  const [status, setStatus] = useState(null); // null=checking, true=up, false=down

  async function check() {
    setStatus(null);
    try {
      const res = await checkTallyStatus();
      setStatus(res.reachable);
    } catch {
      setStatus(false);
    }
  }

  useEffect(() => { check(); }, []);

  return (
    <button
      onClick={check}
      title="Click to recheck Tally connection"
      style={{
        display:     "flex",
        alignItems:  "center",
        gap:         7,
        background:  status === null ? "var(--bg-hover)" : status ? "var(--success-soft)" : "var(--danger-soft)",
        border:      `1px solid ${status === null ? "var(--border)" : status ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
        borderRadius: 20,
        padding:     "4px 12px",
        cursor:      "pointer",
        transition:  "all var(--transition)",
      }}
    >
      <div style={{
        width:  7, height: 7,
        borderRadius: "50%",
        background: status === null ? "var(--text-muted)" : status ? "var(--success)" : "var(--danger)",
        animation: status === null ? "pulse 1.2s infinite" : "none",
      }} />
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: status === null ? "var(--text-muted)" : status ? "var(--success)" : "var(--danger)",
      }}>
        {status === null ? "Checking Tally…" : status ? "Tally Connected" : "Tally Offline"}
      </span>
    </button>
  );
}
