import React, { useState, useCallback } from "react";
import { Upload, FileText, AlertCircle, Loader } from "lucide-react";
import { uploadPDFs } from "../utils/api.js";

function DropZone({ label, hint, file, onFile, accent }) {
    const [dragging, setDragging] = useState(false);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f?.type === "application/pdf") onFile(f);
    }, [onFile]);

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById(`file-${label}`).click()}
            style={{
                border:       `2px dashed ${dragging ? "var(--accent)" : file ? "var(--success)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                background:   dragging ? "var(--accent-soft)" : file ? "var(--success-soft)" : "var(--bg-input)",
                padding:      "40px 32px",
                cursor:       "pointer",
                transition:   "all var(--transition)",
                display:      "flex",
                flexDirection:"column",
                alignItems:   "center",
                gap:          12,
                textAlign:    "center",
                minHeight:    200,
                justifyContent: "center",
            }}
        >
            <input
                id={`file-${label}`}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }}
            />

            <div style={{
                width: 48, height: 48,
                background: file ? "var(--success-soft)" : "var(--bg-hover)",
                borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${file ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
            }}>
                {file
                    ? <FileText size={22} color="var(--success)" />
                    : <Upload size={22} color="var(--text-muted)" />}
            </div>

            <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 4 }}>
                    {label}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {file ? file.name : hint}
                </div>
            </div>

            {file && (
                <div style={{
                    fontSize: 11, color: "var(--success)", fontWeight: 500,
                    background: "var(--success-soft)", padding: "3px 10px",
                    borderRadius: 20, border: "1px solid rgba(34,197,94,0.25)",
                }}>
                    {(file.size / 1024).toFixed(1)} KB · Click to replace
                </div>
            )}
        </div>
    );
}

export default function UploadScreen({ onParsed }) {
    const [sfFile,  setSFFile]  = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState("");

    const canParse = sfFile && !loading;

    async function handleParse() {
        if (!canParse) return;
        setLoading(true);
        setError("");
        try {
            const result = await uploadPDFs(sfFile);
            if (result.success) {
                onParsed(result.data);
            } else {
                setError(result.error || "Parsing failed.");
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message || "Failed to parse PDF.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            maxWidth:  480,
            margin:    "0 auto",
            padding:   "60px 24px",
        }}>
            {/* Title */}
            <div className="fade-up" style={{ marginBottom: 40, textAlign: "center" }}>
                <h1 style={{
                    fontSize: 28, fontWeight: 700,
                    letterSpacing: "-0.03em",
                    marginBottom: 8,
                }}>
                    Upload Purchase Order
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
                    Drop the Salesforce PO PDF — we'll parse it and push it to Tally.
                </p>
            </div>

            {/* Drop zone */}
            <div className="fade-up fade-up-1" style={{ marginBottom: 24 }}>
                <DropZone
                    label="Salesforce PO"
                    hint="Drag & drop or click to browse"
                    file={sfFile}
                    onFile={setSFFile}
                />
            </div>

            {/* Format hint */}
            <div className="fade-up fade-up-2" style={{
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                padding:      "10px 14px",
                background:   "var(--bg-card)",
                border:       "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 24,
                fontSize:     12,
                color:        "var(--text-muted)",
            }}>
                <FileText size={14} style={{ flexShrink: 0 }} />
                Upload the Salesforce-generated Purchase Order PDF to parse and send to TallyPrime.
            </div>

            {/* Error */}
            {error && (
                <div className="fade-up" style={{
                    display:      "flex",
                    alignItems:   "flex-start",
                    gap:          10,
                    padding:      "12px 16px",
                    background:   "var(--danger-soft)",
                    border:       "1px solid rgba(239,68,68,0.3)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: 20,
                    color:        "var(--danger)",
                    fontSize:     13,
                }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    {error}
                </div>
            )}

            {/* Parse button */}
            <div className="fade-up fade-up-3">
                <button
                    onClick={handleParse}
                    disabled={!canParse}
                    style={{
                        width:        "100%",
                        padding:      "13px 0",
                        background:   canParse ? "var(--accent)" : "var(--bg-hover)",
                        color:        canParse ? "#fff" : "var(--text-dim)",
                        border:       "none",
                        borderRadius: "var(--radius)",
                        fontSize:     14,
                        fontWeight:   600,
                        cursor:       canParse ? "pointer" : "not-allowed",
                        transition:   "all var(--transition)",
                        display:      "flex",
                        alignItems:   "center",
                        justifyContent:"center",
                        gap:          8,
                        fontFamily:   "var(--font)",
                    }}
                >
                    {loading ? (
                        <>
                            <div style={{
                                width: 15, height: 15,
                                border: "2px solid rgba(255,255,255,0.3)",
                                borderTopColor: "#fff",
                                borderRadius: "50%",
                                animation: "spin 0.7s linear infinite",
                            }} />
                            Parsing PDF…
                        </>
                    ) : (
                        "Parse & Continue →"
                    )}
                </button>
            </div>
        </div>
    );
}