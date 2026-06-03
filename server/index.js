const express = require("express");
const cors = require("cors");
const path = require("path");

const uploadRoutes = require("./routes/upload");
const tallyRoutes = require("./routes/tally");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors()); // Allow all CORS in the bundled version
app.use(express.json());

// ── Serve Frontend ────────────────────────────────────────────────────────────
// Tell Express to serve the static Vite build from the 'public' folder
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/upload", uploadRoutes);
app.use("/api/tally", tallyRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── SPA Catch-All ─────────────────────────────────────────────────────────────
// This ensures that if your boss refreshes the page, the frontend router handles it
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 PO-Tally Portal server running on http://localhost:${PORT}`);
  console.log(`   Upload endpoint  : POST /api/upload`);
  console.log(`   Tally endpoint   : POST /api/tally/push`);
  console.log(`   Health check     : GET  /api/health\n`);

  // Auto-open the browser for your boss
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}`);
  } catch (err) {
    console.log(`Open browser manually at http://localhost:${PORT}`);
  }
});