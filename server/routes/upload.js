/**
 * routes/upload.js
 * POST /api/upload
 * Accepts one PDF file (sfPO), parses it, returns merged JSON.
 */

const express  = require("express");
const multer   = require("multer");
const pdfParse = require("pdf-parse");
const router   = express.Router();

const { parseSalesforcePO } = require("../parser/parseSalesforcePO");
const { mergePOData }       = require("../parser/mergePO");

// Store files in memory — no disk writes needed
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are accepted."));
  },
});

/**
 * POST /api/upload
 * Body: multipart/form-data with field "sfPO"
 * Returns: parsed + merged PO JSON
 */
router.post(
    "/",
    upload.fields([{ name: "sfPO", maxCount: 1 }]),
    async (req, res) => {
      try {
        // ── Validate file is present ─────────────────────────────────────────
        if (!req.files?.sfPO?.[0]) {
          return res.status(400).json({
            error: "File is required: sfPO (Salesforce PO).",
          });
        }

        const sfBuffer = req.files.sfPO[0].buffer;

        // ── Extract text from PDF ────────────────────────────────────────────
        const sfParsed = await pdfParse(sfBuffer);
        const sfText   = sfParsed.text;

        // ── Parse Salesforce PO ──────────────────────────────────────────────
        const sfData = parseSalesforcePO(sfText);

        // ── Build unified structure (SF-only, no email PO) ───────────────────
        const merged = mergePOData(sfData);

        return res.json({
          success:   true,
          data:      merged,
          rawSFText: sfText.slice(0, 200), // first 200 chars for debug
        });
      } catch (err) {
        console.error("Upload error:", err);
        return res.status(500).json({
          error:   "Failed to parse PDF.",
          details: err.message,
        });
      }
    }
);

module.exports = router;