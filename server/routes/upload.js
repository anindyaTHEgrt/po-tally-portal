/**
 * routes/upload.js
 * POST /api/upload
 * Accepts two PDF files (sfPO + emailPO), parses them, returns merged JSON.
 */

const express  = require("express");
const multer   = require("multer");
const pdfParse = require("pdf-parse");
const router   = express.Router();

const { detectEmailPOFormat } = require("../parser/detectFormat");
const { parseSalesforcePO }   = require("../parser/parseSalesforcePO");
const { parseBorkarPO, parseParksons } = require("../parser/parseBorkarPO");
const { mergePOData }         = require("../parser/mergePO");

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
 * Body: multipart/form-data with fields "sfPO" and "emailPO"
 * Returns: merged PO JSON
 */
router.post(
  "/",
  upload.fields([
    { name: "sfPO",    maxCount: 1 },
    { name: "emailPO", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // ── Validate both files are present ─────────────────────────────────────
      if (!req.files?.sfPO?.[0] || !req.files?.emailPO?.[0]) {
        return res.status(400).json({
          error: "Both files are required: sfPO (Salesforce PO) and emailPO (vendor email PO).",
        });
      }

      const sfBuffer    = req.files.sfPO[0].buffer;
      const emailBuffer = req.files.emailPO[0].buffer;

      // ── Extract text from both PDFs ─────────────────────────────────────────
      const [sfParsed, emailParsed] = await Promise.all([
        pdfParse(sfBuffer),
        pdfParse(emailBuffer),
      ]);

      const sfText    = sfParsed.text;
      const emailText = emailParsed.text;

      // ── Parse Salesforce PO ─────────────────────────────────────────────────
      const sfData = parseSalesforcePO(sfText);

      // ── Auto-detect and parse email PO ──────────────────────────────────────
      const emailFormat = detectEmailPOFormat(emailText);
      let emailData;

      if (emailFormat === "BORKAR") {
        emailData = parseBorkarPO(emailText);
      } else if (emailFormat === "PARKSONS") {
        emailData = parseParksons(emailText);
      } else {
        emailData = {
          source:  "UNKNOWN",
          warning: "Could not detect email PO format. Proceeding with SF data only.",
          lineItems: [],
          totals: {},
          poMeta: {},
        };
      }

      // ── Merge into unified structure ────────────────────────────────────────
      const merged = mergePOData(sfData, emailData);

      // Return merged data + detected format info
      return res.json({
        success:      true,
        emailFormat,
        data:         merged,
        rawSFText:    sfText.slice(0, 200),    // first 200 chars for debug
        rawEmailText: emailText.slice(0, 200),
      });
    } catch (err) {
      console.error("Upload error:", err);
      return res.status(500).json({
        error:   "Failed to parse PDFs.",
        details: err.message,
      });
    }
  }
);

module.exports = router;
