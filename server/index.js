const express = require("express");
const cors = require("cors");
const path = require("path");

const uploadRoutes = require("./routes/upload");
const tallyRoutes = require("./routes/tally");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173" })); // Vite dev server
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/upload", uploadRoutes);
app.use("/api/tally", tallyRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 PO-Tally Portal server running on http://localhost:${PORT}`);
  console.log(`   Upload endpoint  : POST /api/upload`);
  console.log(`   Tally endpoint   : POST /api/tally/push`);
  console.log(`   Health check     : GET  /api/health\n`);
});
