/**
 * ledgerSearch.js  (add to routes/tally.js or mount separately)
 *
 * GET /api/tally/ledgers?search=borkar&company=BPM+TEST
 *
 * Queries TallyPrime for ledger master data matching the search term.
 * Returns: name, GSTIN, PAN, address, stateName, stateCode, parentGroup
 *
 * HOW IT WORKS
 * ─────────────
 * Tally's XML gateway supports "Export Data" for "Ledger" objects.
 * We use a TDL FETCH list to pull exactly the fields we need.
 * The response is XML; we parse it with simple regex (no DOM parser needed).
 *
 * USAGE
 * ─────
 * // In routes/tally.js, add:
 * const { ledgerSearchRouter } = require("./ledgerSearch");
 * router.use("/", ledgerSearchRouter);
 *
 * OR paste the router.get("/ledgers", ...) block directly into tally.js.
 */

const express = require("express");
const axios   = require("axios");
const router  = express.Router();

const TALLY_HOST = "http://localhost";
const TALLY_PORT = process.env.TALLY_PORT || 9000;
const TALLY_URL  = `${TALLY_HOST}:${TALLY_PORT}`;

// ── XML builder ───────────────────────────────────────────────────────────────

/**
 * Builds a Tally "Export Data" XML request that fetches all ledger masters
 * with their GSTIN, PAN, address, and state fields.
 *
 * We request ALL ledgers then filter server-side to avoid TDL complexity.
 * For a typical Tally company this is <2 MB and parses in milliseconds.
 */
function buildLedgerExportXML(companyName) {
    const co = companyName
        ? `<SVCURRENTCOMPANY>${escXml(companyName)}</SVCURRENTCOMPANY>`
        : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Ledgers</REPORTNAME>
        <STATICVARIABLES>
          ${co}
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`.trim();
}

function escXml(v) {
    return String(v || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ── XML parser ────────────────────────────────────────────────────────────────

/**
 * Extracts the text content of the first occurrence of <TAG>...</TAG>
 * (case-insensitive) from a string fragment.
 */
function tag(fragment, tagName) {
    const m = fragment.match(
        new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`, "i")
    );
    return (m ? m[1] : "").trim();
}

/**
 * Parses Tally's XML ledger export into an array of plain objects.
 * Each <LEDGER> block in the response is one entry.
 */
function parseLedgerXML(xmlText) {
    const ledgers = [];

    // Split on opening <LEDGER NAME="..."> tags
    const blocks = xmlText.split(/<LEDGER\s+NAME=/i);
    // blocks[0] is the envelope header — skip it
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        // Extract ledger name from the NAME="..." attribute
        const nameMatch = block.match(/^"([^"]+)"/);
        if (!nameMatch) continue;
        const name = nameMatch[1].trim();

        const gstin   = tag(block, "PARTYGSTIN") || tag(block, "GSTIN");
        const pan     = tag(block, "PANNO")      || tag(block, "PAN");
        const parent  = tag(block, "PARENT");
        const state   = tag(block, "STATENAME");
        const country = tag(block, "COUNTRYNAME");

        // Address: Tally stores address lines in <ADDRESS.LIST><ADDRESS>…</ADDRESS></ADDRESS.LIST>
        const addrLines = [];
        const addrRx = /<ADDRESS>([^<]+)<\/ADDRESS>/gi;
        let am;
        while ((am = addrRx.exec(block)) !== null) {
            const line = am[1].trim();
            if (line) addrLines.push(line);
        }
        const address = addrLines.join(", ");

        // Derive numeric state code from GSTIN prefix (first 2 digits)
        const stateCode = gstin ? gstin.slice(0, 2) : "";

        // Only include ledgers that have at least a GSTIN or are under a
        // Sundry Debtors / Sundry Creditors parent — avoids returning every
        // expense or bank ledger.
        const isParty =
            gstin ||
            /sundry/i.test(parent) ||
            /debtor|creditor|customer|supplier|vendor|party/i.test(parent);

        if (!isParty) continue;

        ledgers.push({ name, gstin, pan, address, stateName: state, stateCode, parentGroup: parent, country });
    }

    return ledgers;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/tally/ledgers
 *
 * Query params:
 *   search  (string)  — partial name / GSTIN to filter by  [required, min 2 chars]
 *   company (string)  — override company name               [optional]
 *   limit   (number)  — max results to return               [default: 20]
 *
 * Response:
 *   { success: true,  ledgers: [...] }
 *   { success: false, error: "..." }
 */
router.get("/ledgers", async (req, res) => {
    const search  = (req.query.search  || "").trim();
    const company = (req.query.company || process.env.TALLY_COMPANY || "").trim();
    const limit   = Math.min(parseInt(req.query.limit || "20", 10), 100);

    if (search.length < 2) {
        return res.status(400).json({
            success: false,
            error:   "Provide at least 2 characters to search.",
        });
    }

    try {
        const xml = buildLedgerExportXML(company);

        const response = await axios.post(TALLY_URL, xml, {
            headers: { "Content-Type": "text/xml;charset=utf-8" },
            timeout: 15000,
        });

        const resText =
            typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data);

        // Detect Tally-level error
        if (/<LINEERROR>/i.test(resText)) {
            const errMsg = (resText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i) || [])[1] || "Unknown Tally error";
            return res.status(500).json({ success: false, error: errMsg });
        }

        const all = parseLedgerXML(resText);

        // Case-insensitive filter on name or GSTIN
        const q = search.toUpperCase();
        const filtered = all
            .filter(
                (l) =>
                    l.name.toUpperCase().includes(q) ||
                    (l.gstin && l.gstin.toUpperCase().includes(q))
            )
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

// ── Exact lookup ──────────────────────────────────────────────────────────────

/**
 * GET /api/tally/ledgers/:name
 * Returns full details for a single ledger by exact name.
 * Useful after selection to re-confirm live data.
 */
router.get("/ledgers/:name", async (req, res) => {
    const name    = decodeURIComponent(req.params.name).trim();
    const company = (req.query.company || process.env.TALLY_COMPANY || "").trim();

    if (!name) {
        return res.status(400).json({ success: false, error: "Name is required." });
    }

    try {
        const xml  = buildLedgerExportXML(company);
        const response = await axios.post(TALLY_URL, xml, {
            headers: { "Content-Type": "text/xml;charset=utf-8" },
            timeout: 15000,
        });

        const resText =
            typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data);

        const all   = parseLedgerXML(resText);
        const found = all.find(
            (l) => l.name.toUpperCase() === name.toUpperCase()
        );

        if (!found) {
            return res.status(404).json({ success: false, error: `Ledger "${name}" not found in Tally.` });
        }

        return res.json({ success: true, ledger: found });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { ledgerSearchRouter: router };