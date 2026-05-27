/**
 * routes/tally.js
 * POST /api/tally/push   — creates masters then pushes voucher to Tally
 * GET  /api/tally/status — checks if TallyPrime is reachable
 *
 * FIX: Masters failure is logged with full detail. The company name can now
 * be passed in the request body as `tallyCompany` to override the default,
 * which resolves the "Could not set SVCurrentCompany" warning when the open
 * company name differs from the hardcoded constant.
 */

const express = require("express");
const router  = express.Router();

const { buildPurchaseOrderXML, buildMastersXML, resolveJKStockGroup } = require("../tally/buildXML");
const { postToTally, checkTallyConnection }                            = require("../tally/sendToTally");

/**
 * GET /api/tally/status
 */
router.get("/status", async (req, res) => {
  const result = await checkTallyConnection();
  return res.json(result);
});

/**
 * GET /api/tally/resolve-groups?items=DESC1,DESC2,...
 * Debug endpoint — shows which stock group each description resolves to.
 */
router.get("/resolve-groups", (req, res) => {
  const items = (req.query.items || "").split(",").map((s) => s.trim()).filter(Boolean);
  const resolved = items.map((desc) => ({
    description: desc,
    resolvedGroup: resolveJKStockGroup(desc),
  }));
  return res.json({ resolved });
});

/**
 * POST /api/tally/push
 * Body: {
 *   data: <merged PO JSON from /api/upload>,
 *   tallyCompany?: "Override Company Name"   ← optional, overrides TALLY_COMPANY
 * }
 */
router.post("/push", async (req, res) => {
  try {
    const { data, tallyCompany } = req.body;

    if (!data) {
      return res.status(400).json({ error: "No PO data provided. Upload PDFs first." });
    }

    // Allow per-request company name override (handles the SVCurrentCompany mismatch)
    if (tallyCompany) {
      data.tallyCompany = tallyCompany;
    }

    const today = new Date().toISOString().split("T")[0];

    if (!data.header.date) {
      console.warn("⚠️  Document Date missing — falling back to today.");
      data.header.date = today;
    }
    if (!data.header.deliveryDate) {
      console.warn("⚠️  Delivery Date missing — falling back to today.");
      data.header.deliveryDate = today;
    }

    // Log which stock groups each item resolved to (useful for debugging)
    const groupResolutions = data.lineItems.map((i) => ({
      item:  i.description,
      group: resolveJKStockGroup(i.description),
    }));
    console.log("📦 Stock group resolutions:", JSON.stringify(groupResolutions, null, 2));

    // ── Step 1: Create masters ───────────────────────────────────────────────
    console.log(`📋 Creating masters for PO: ${data.meta?.sfPONumber}`);
    const mastersXML    = buildMastersXML(data);
    const mastersResult = await postToTally(mastersXML);

    if (!mastersResult.success) {
      // Non-fatal — ledger/items may already exist in Tally (duplicate create = warning, not failure)
      console.warn("⚠️  Masters warning:", mastersResult.error);
      console.warn("    Full Tally response:", mastersResult.response?.slice(0, 500));
    } else {
      console.log(`✅ Masters created: imported=${mastersResult.imported}, failed=${mastersResult.failed}`);
    }

    // ── Step 2: Push Purchase Order voucher ─────────────────────────────────
    console.log(`🚀 Pushing voucher: ${data.meta?.sfPONumber}`);
    const voucherXML    = buildPurchaseOrderXML(data);
    console.log("VOUCHER XML:\n", voucherXML);
    const voucherResult = await postToTally(voucherXML);

    if (!voucherResult.success) {
      return res.status(500).json({
        success:        false,
        stage:          "voucher",
        error:          voucherResult.error,
        mastersResult,
        voucherResult,
        groupResolutions,
        xml:            voucherXML,
      });
    }

    console.log(`✅ Voucher pushed: ${data.meta?.sfPONumber}`);
    return res.json({
      success:          true,
      message:          `Purchase Order ${data.meta?.internalPONo} pushed to TallyPrime successfully.`,
      sfPONumber:       data.meta?.sfPONumber,
      voucherNo:        data.header?.voucherNo,
      grandTotal:       data.totals?.grandTotal,
      groupResolutions,
      mastersResult,
      voucherResult,
    });
  } catch (err) {
    console.error("Tally push error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;