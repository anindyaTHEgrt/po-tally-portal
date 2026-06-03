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
const axios   = require("axios");
const router  = express.Router();

const { buildPurchaseOrderXML, buildMastersXML, resolveJKStockGroup } = require("../tally/buildXML");
const { postToTally, checkTallyConnection, TALLY_URL }                 = require("../tally/sendToTally");

/**
 * GET /api/tally/status
 */
router.get("/status", async (req, res) => {
  const result = await checkTallyConnection();
  return res.json(result);
});

/**
 * GET /api/tally/config
 * Returns current Tally configuration from environment variables.
 * Used by the frontend to pre-fill the company name field.
 */
router.get("/config", (req, res) => {
  return res.json({
    tallyCompany: process.env.TALLY_COMPANY || "BPM TEST",
    tallyPort:    process.env.TALLY_PORT    || 9000,
    tallyState:   process.env.TALLY_STATE   || "Maharashtra",
    tallyGstin:   process.env.TALLY_GSTIN   || "27AAJFB0186H1ZH",
  });
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

// ── Ledger search helpers ─────────────────────────────────────────────────────

/**
 * Builds a TallyPrime "Export Collection" XML request for all Ledger masters.
 *
 * WHY COLLECTION, NOT REPORT:
 *   "Export Data" + REPORTNAME only works for screen-reports that exist in the
 *   Tally menu (e.g. "Balance Sheet"). "List of Ledgers" is not such a report.
 *   The correct approach is "Export Collection" + COLLECTIONNAME "Ledger" which
 *   is a built-in Tally master collection and always available.
 *
 * FETCH list pulls exactly the fields we need so the response stays small.
 */
function buildLedgerExportXML(companyName) {
  const co = companyName
      ? `<SVCURRENTCOMPANY>${xmlEscLocal(companyName)}</SVCURRENTCOMPANY>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          ${co}
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>Ledgers</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`.trim();
}

function xmlEscLocal(v) {
  return String(v || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Parses Tally's XML ledger export into an array of plain objects.
 * Handles both <LEDGER NAME="..."> (collection export) and
 * <ACCOUNT NAME="..."> (List of Accounts report) node formats.
 * Returns: { name, gstin, pan, address, stateName, stateCode, parentGroup }
 */
function parseLedgerXML(xmlText) {
  const ledgers = [];

  // Match either <LEDGER NAME="..."> or <ACCOUNT NAME="..."> blocks
  const splitRx = /<(?:LEDGER|ACCOUNT)\s+NAME=/gi;
  const blocks  = xmlText.split(splitRx);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const nameMatch = block.match(/^"([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    const tagVal = (t) => {
      const m = block.match(new RegExp(`<${t}>([^<]*)<\\/${t}>`, "i"));
      return (m ? m[1] : "").trim();
    };

    const gstin  = tagVal("PARTYGSTIN") || tagVal("GSTIN");
    const pan    = tagVal("PANNO")      || tagVal("PAN");
    const parent = tagVal("PARENT");
    const state  = tagVal("STATENAME");

    // Address lines stored as repeated <ADDRESS> inside <ADDRESS.LIST>.
    // Tally exports addresses with HTML entities (&amp; &#13; &#10; etc.) — decode them.
    const decodeEntities = (str) => str
        .replace(/&amp;/gi,  "&")
        .replace(/&lt;/gi,   "<")
        .replace(/&gt;/gi,   ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#13;/gi,  "")
        .replace(/&#10;/gi,  " ")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
        .replace(/\s+/g, " ")
        .trim();

    const addrLines = [];
    const addrRx    = /<ADDRESS>([\s\S]*?)<\/ADDRESS>/gi;
    let   am;
    while ((am = addrRx.exec(block)) !== null) {
      const line = decodeEntities(am[1]);
      if (line) addrLines.push(line);
    }
    // Join with newline so buildAddressListXML splits lines correctly.
    // Avoid ", " which doubles up lines that already end with commas.
    const address = addrLines.join("\n");
    const stateCode = gstin ? gstin.slice(0, 2) : "";

    // Only return party ledgers — skip expense/bank/capital accounts
    const isParty =
        gstin ||
        /sundry/i.test(parent) ||
        /debtor|creditor|customer|supplier|vendor|party/i.test(parent);

    if (!isParty) continue;

    ledgers.push({ name, gstin, pan, address, stateName: state, stateCode, parentGroup: parent });
  }

  return ledgers;
}

/**
 * GET /api/tally/ledgers?search=borkar&company=BPM+TEST&limit=20
 * Searches Tally ledger masters and returns matching party ledgers.
 * Response: { success, ledgers: [{ name, gstin, pan, address, stateName, stateCode }] }
 */
router.get("/ledgers", async (req, res) => {
  const search  = (req.query.search  || "").trim();
  const company = (req.query.company || process.env.TALLY_COMPANY || "").trim();
  const limit   = Math.min(parseInt(req.query.limit || "20", 10), 100);

  if (search.length < 2) {
    return res.status(400).json({ success: false, error: "Provide at least 2 characters to search." });
  }

  try {
    const xml      = buildLedgerExportXML(company);
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml;charset=utf-8" },
      timeout: 15000,
    });

    const resText = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    if (/<LINEERROR>/i.test(resText)) {
      const msg = (resText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i) || [])[1] || "Unknown Tally error";
      return res.status(500).json({ success: false, error: msg });
    }

    const all      = parseLedgerXML(resText);
    const q        = search.toUpperCase();
    const filtered = all
        .filter((l) => l.name.toUpperCase().includes(q) || (l.gstin && l.gstin.toUpperCase().includes(q)))
        .slice(0, limit);

    return res.json({ success: true, ledgers: filtered, total: all.length });

  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      return res.status(503).json({
        success: false,
        error:   `Cannot connect to TallyPrime on ${TALLY_URL}. Make sure Gateway Server is enabled.`,
      });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
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