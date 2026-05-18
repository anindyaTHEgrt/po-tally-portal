import React, { useState } from "react";
import UploadScreen  from "./components/UploadScreen.jsx";
import ReviewScreen  from "./components/ReviewScreen.jsx";
import ResultScreen  from "./components/ResultScreen.jsx";
import TallyStatus   from "./components/TallyStatus.jsx";

// App states
const SCREEN = { UPLOAD: "upload", REVIEW: "review", RESULT: "result" };

export default function App() {
  const [screen,  setScreen]  = useState(SCREEN.UPLOAD);
  const [poData,  setPOData]  = useState(null);   // merged PO JSON from server
  const [result,  setResult]  = useState(null);   // tally push result

  function handleParsed(data) {
    setPOData(data);
    setScreen(SCREEN.REVIEW);
  }

  function handlePushed(res) {
    setResult(res);
    setScreen(SCREEN.RESULT);
  }

  function handleReset() {
    setPOData(null);
    setResult(null);
    setScreen(SCREEN.UPLOAD);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 32px",
        height:         56,
        borderBottom:   "1px solid var(--border)",
        background:     "var(--bg-card)",
        flexShrink:     0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28,
            background: "var(--accent)",
            borderRadius: 7,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#fff",
          }}>P</div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>
            PO → Tally
          </span>
          <span style={{
            fontSize: 11, color: "var(--text-muted)", fontWeight: 400,
            background: "var(--bg-hover)", padding: "2px 8px",
            borderRadius: 20, border: "1px solid var(--border)",
          }}>
            Bluecoast Meridian
          </span>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {["Upload", "Review", "Done"].map((label, i) => {
            const states   = [SCREEN.UPLOAD, SCREEN.REVIEW, SCREEN.RESULT];
            const active   = screen === states[i];
            const complete = states.indexOf(screen) > i;
            return (
              <React.Fragment key={label}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: active || complete ? 1 : 0.35,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: complete ? "var(--success)" : active ? "var(--accent)" : "var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "#fff",
                    transition: "background var(--transition)",
                  }}>{complete ? "✓" : i + 1}</div>
                  <span style={{
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    color: active ? "var(--text)" : "var(--text-muted)",
                  }}>{label}</span>
                </div>
                {i < 2 && <div style={{ width: 20, height: 1, background: "var(--border)" }} />}
              </React.Fragment>
            );
          })}
        </div>

        <TallyStatus />
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto" }}>
        {screen === SCREEN.UPLOAD && (
          <UploadScreen onParsed={handleParsed} />
        )}
        {screen === SCREEN.REVIEW && poData && (
          <ReviewScreen
            data={poData}
            onPushed={handlePushed}
            onBack={handleReset}
          />
        )}
        {screen === SCREEN.RESULT && result && (
          <ResultScreen
            result={result}
            poData={poData}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}
