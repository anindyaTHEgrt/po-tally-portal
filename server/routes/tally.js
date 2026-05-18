/**
 * routes/tally.js
 * POST /api/tally/push   — creates masters then pushes voucher to Tally
 * GET  /api/tally/status — checks if TallyPrime is reachable
 */

const express = require("express");
const router  = express.Router();

const { buildPurchaseOrderXML, buildMastersXML } = require("../tally/buildXML");
const { postToTally, checkTallyConnection }       = require("../tally/sendToTally");

/**
 * GET /api/tally/status
 * Quick ping to check if TallyPrime is up.
 */
router.get("/status", async (req, res) => {
  const result = await checkTallyConnection();
  return res.json(result);
});

/**
 * POST /api/tally/push
 * Body: { data: <merged PO JSON from /api/upload> }
 * Flow:
 *   1. Build and send masters XML (creates party ledger + stock items if missing)
 *   2. Build and send Purchase Order voucher XML
 *   3. Return result
 */
router.post("/push", async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: "No PO data provided. Upload PDFs first." });
    }

    const today = new Date().toISOString().split("T")[0];

    if (!data.header.date) {
      console.warn("⚠️ Document Date missing from PDF, falling back to today's date.");
      data.header.date = today;
    }

    if (!data.header.deliveryDate) {
      console.warn("⚠️ Delivery Date missing from PDF, falling back to today's date.");
      data.header.deliveryDate = today;
    }

    // ── Step 1: Create masters ───────────────────────────────────────────────
    console.log(`📋 Creating masters for PO: ${data.meta?.sfPONumber}`);
    const mastersXML    = buildMastersXML(data);
    const mastersResult = await postToTally(mastersXML);

    if (!mastersResult.success) {
      // Masters creation failure is non-fatal — ledgers may already exist
      console.warn("Masters creation warning:", mastersResult.error);
    }

    // ── Step 2: Push Purchase Order voucher ─────────────────────────────────
    console.log(`🚀 Pushing voucher to Tally: ${data.meta?.sfPONumber}`);
    const voucherXML    = buildPurchaseOrderXML(data);
    const voucherResult = await postToTally(voucherXML);

    if (!voucherResult.success) {
      return res.status(500).json({
        success:        false,
        stage:          "voucher",
        error:          voucherResult.error,
        mastersResult,
        voucherResult,
        xml:            voucherXML, // for debugging
      });
    }

    // ── Success ──────────────────────────────────────────────────────────────
    console.log(`✅ Voucher pushed successfully: ${data.meta?.sfPONumber}`);
    return res.json({
      success:        true,
      message:        `Purchase Order ${data.meta?.internalPONo} pushed to TallyPrime successfully.`,
      sfPONumber:     data.meta?.sfPONumber,
      voucherNo:      data.header?.voucherNo,
      grandTotal:     data.totals?.grandTotal,
      mastersResult,
      voucherResult,
    });
  } catch (err) {
    console.error("Tally push error:", err);
    return res.status(500).json({
      success: false,
      error:   err.message,
    });
  }
});

module.exports = router;
