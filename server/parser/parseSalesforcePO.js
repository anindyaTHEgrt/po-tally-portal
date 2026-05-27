/**
 * parseSalesforcePO.js
 *
 * pdf-parse layout:
 *  - Values appear BEFORE their labels: " 356 Internal Customer PO NO:"
 *  - Line items span 4 lines:
 *      "PO260481134-020"
 *      "JK TUFFCOTE 300"
 *      "GSM"
 *      "FBD - JK TUFFCOTEFBD/BDL/84.00X63.50/100/16.0016481092001024.0075776.00SWGO03"
 *    (all item fields concatenated with no spaces in last line)
 */

const { cleanAmount, cleanQty, deriveStateFromGSTIN, determineGSTType } = require("./utils");

function parseSalesforcePO(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  function find(pat) {
    const m = text.match(pat);
    return m ? m[1].trim() : "";
  }

// Using (\S+) to catch EVERYTHING (numbers, letters like 'Apr', slashes, dots)
  const poNumber      = find(/(\S+)\s+Purchase Order No:/);
  const docDate = find(/([\d]{1,4}[-\/][\d]{1,2}[-\/][\d]{2,4}|[\d]{8})\s+Document Date:/);
  const deliveryDate  = find(/(\S+)\s+Requested Delivery Date:/);
  const internalPONo  = find(/^\s*(\d+)\s+Internal Customer PO NO:/m);
  const paymentTerms  = find(/^\s*(.+?)\s+Payment Terms:/m);
  const insurance     = find(/^\s*(.+?)\s+Insurance:/m);
  const orderType     = find(/^\s*(.+?)\s+Order Type\s*:/m) || "JKPL Domestic Sales";
  const distChannel   = find(/^\s*(.+?)\s+Distribution Channel\s*:/m) || "32 - Direct";
  const plantDepot    = find(/^\s*(.+?)\s+Plant Depot:/m) || "2200 - JK PAPER LIMITED";
  const transportMode = find(/^\s*(.+?)\s+Mode Of Transport:/m);
  const deliveryTo    = find(/^\s*(\w+)\s+Delivery To:/m);

  // ── Parties ────────────────────────────────────────────────────────────────
  const billToGSTIN   = find(/GSTIN No:\s*(27[A-Z0-9]+)/);
  const billToPAN     = find(/PAN:\s*(AAJFB\w+)/);
  const billToNo      = find(/Bill To Party No:\s*(\d+)/);
  const shipToGSTIN   = find(/GSTIN No:\s*(30[A-Z0-9]+)/);
  const shipToPAN     = find(/PAN:\s*(AAACB\w+)/);
  const shipToNo      = find(/Ship To Party No:\s*(\d+)/);
  const shipToAddress = find(/(PLOT NO\.[\s\S]+?)(?=GSTIN No:\s*30)/i).replace(/\s+/g, " ").trim();

  // ── Line Items ─────────────────────────────────────────────────────────────
  // Span 4 lines: ref / brand-p1 / brand-p2("GSM") / concatenated-data
  // Data line: "FBD - JK TUFFCOTE" + materialCode + [packages] + HSN + qty.00 + amount.00 + route
  const lineItems = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^PO\d+-\d{3}$/.test(lines[i])) continue;

    const fullLineRef  = lines[i];                       // "PO260481134-020"
    const lineNo       = fullLineRef.split("-").pop();   // "020"
    const brandP1      = lines[i + 1] || "";            // "JK TUFFCOTE 300"
    // lines[i+2] is "GSM", lines[i+3] is the data line
    const dataLine     = lines[i + 3] || "";

    // Anchor on HSN code (always "48109200") to split before/after
    const hsnCode = "48109200";
    const hsnIdx  = dataLine.indexOf(hsnCode);
    if (hsnIdx === -1) continue;

    const before = dataLine.slice(0, hsnIdx);
    const after  = dataLine.slice(hsnIdx + hsnCode.length);

    // before: "FBD - JK TUFFCOTEFBD/BDL/84.00X63.50/100/16.0016"
    const brand   = "FBD - JK TUFFCOTE";
    const matRaw  = before.slice(before.indexOf("FBD/"));
    // Material code ends at /nn.nn then optional package integer
    const matM    = matRaw.match(/^(FBD\/[A-Z]+\/[\d.]+X[\d.]+\/\d+\/\d+\.\d{2})(\d*)$/);
    const materialCode = matM ? matM[1] : matRaw;
    const noPackages   = matM ? matM[2] : "";

    // after: "1024.0075776.00SWGO03" — split on first ".00" boundary
    const firstDotZero = after.indexOf(".00");
    if (firstDotZero === -1) continue;
    const qty    = parseFloat(after.slice(0, firstDotZero + 3));
    const rest   = after.slice(firstDotZero + 3);
    const secDot = rest.indexOf(".00");
    if (secDot === -1) continue;
    const amount    = parseFloat(rest.slice(0, secDot + 3));
    const routeCode = rest.slice(secDot + 3).trim();

    // Derive Tally description from material code dimensions
    // FBD/BDL/84.00X63.50/100/16.00 → "TC - 300 GSM - 84 X 63.5"
    const gsmM  = brandP1.match(/(\d{3})/);
    const gsm   = gsmM ? gsmM[1] : "300";
    const sizeM = materialCode.match(/(\d+\.\d+)X(\d+\.\d+)/);
    let description = `JK TUFFCOTE ${gsm} GSM`;
    if (sizeM) {
      const w = parseFloat(sizeM[1]).toFixed(1);   // 84.00 → "84.0"
      const h = parseFloat(sizeM[2]).toFixed(1);   // 63.50 → "63.5"
      description = `TC - ${gsm} GSM - ${w} X ${h}`; // matches Tally exactly
    }

    lineItems.push({
      lineNo,
      fullLineRef,
      itemBrand:    `${brandP1} GSM ${brand}`.trim(),
      brand,
      materialCode,
      description,
      hsnCode,
      noPackages,
      quantityKg:   qty,
      unit:         "Kgs",
      amount,
      ratePerKg:    qty > 0 ? Math.round((amount / qty) * 100) / 100 : 0,
      routeCode,
      fscType:      "",
    });
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalQtyKg  = cleanQty(find(/Total Quantity \(kg\)\s*:\s*([\d,\.]+)/));
  const totalAmount = cleanAmount(find(/Total Amount:\s*([\d,\.]+)/));
  const billToState = deriveStateFromGSTIN(billToGSTIN);
  const shipToState = deriveStateFromGSTIN(shipToGSTIN);
  const gstType     = determineGSTType(billToGSTIN, shipToGSTIN);

  return {
    source: "SALESFORCE",
    header: {
      poNumber, internalPONo, documentDate: docDate, deliveryDate,
      orderType, distChannel, plantDepot, paymentTerms, insurance,
      transportMode, deliveryTo,
    },
    billTo: {
      partyName: "BHARAT PAPER MART",
      address: "219, Podar Chambers, 109, S.A. Brelvi Road, Fort, Mumbai - 400 001",
      email: "bharatpapermart@gmail.com",
      gstin: billToGSTIN, pan: billToPAN,
      stateName: billToState.stateName, stateCode: billToState.stateCode,
    },
    shipTo: {
      partyNo: shipToNo, partyName: "BORKAR PACKAGING PVT. LTD.- GOA",
      address: shipToAddress,
      gstin: shipToGSTIN, pan: shipToPAN,
      stateName: shipToState.stateName, stateCode: shipToState.stateCode,
    },
    lineItems,
    totals: { totalQtyKg, totalAmount, gstType },
  };
}

module.exports = { parseSalesforcePO };