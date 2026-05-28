/**
 * parseSalesforcePO.js
 * * Robust parser utilizing a sequential "Zip" method.
 * Extracts PO references and Material Data blocks independently from the raw
 * string and merges them, completely avoiding line-break and spacing issues
 * caused by pdf-parse.
 */

const { cleanAmount, cleanQty, deriveStateFromGSTIN, determineGSTType } = require("./utils");

const BRAND_CODE_MAP = {
  FBD: { tallyCode: "TC", fullName: "JK TUFFCOTE" },
  CPB: { tallyCode: "PL", fullName: "JK PLATINA"  },
  CBB: { tallyCode: "UL", fullName: "JK ULTIMA"   },
};

/**
 * Builds the exact Tally nomenclature description.
 */
function buildDescription(brandPrefix, gsm, materialCode) {
  const entry = BRAND_CODE_MAP[brandPrefix];
  const code  = entry ? entry.tallyCode : brandPrefix;
  const name  = entry ? entry.fullName  : brandPrefix;

  // Normalize OCR artifacts where a dot is sometimes read as a colon
  const safeMatCode = materialCode.replace(/:/g, ".");

  const sheetM = safeMatCode.match(/([\d.]+)X([\d.]+)/);
  if (sheetM) {
    const fmt = n => parseFloat(n).toFixed(1);
    return `${code} - ${gsm} GSM - ${fmt(sheetM[1])} X ${fmt(sheetM[2])}`;
  }

  const reelM = safeMatCode.match(/\/REL\/([\d.]+)\//);
  if (reelM) {
    const w = parseFloat(reelM[1]);
    const ws = w % 1 === 0 ? w.toFixed(1) : w.toString();
    return `${code} - ${gsm} GSM - ${ws} CMS IN REELS`;
  }

  return `${name} ${gsm} GSM`;
}

/**
 * Helper to match fields regardless of whether the label comes before or after the value.
 */
function findAny(text, regexes) {
  for (const rx of regexes) {
    const m = text.match(rx);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

/**
 * Core Line Item Parser
 */
function parsePOLineItems(text) {
  const poRefs = [];
  // Find all Line Item PO References (e.g. PO260481134-020)
  const poRegex = /(PO\d+-\d{3})/g;
  let match;

  while ((match = poRegex.exec(text)) !== null) {
    const fullLineRef = match[1];
    const lineNo = fullLineRef.split("-").pop();

    // Look ahead briefly to secure the GSM rating for this item
    const forwardText = text.slice(match.index, match.index + 150);
    const gsmMatch = forwardText.match(/(\d{3})\s*GSM/i);
    const gsm = gsmMatch ? gsmMatch[1] : "300";

    poRefs.push({ fullLineRef, lineNo, gsm });
  }

  const dataBlocks = [];
  // Regex isolates the material code, HSN, separated amounts, and Route code.
  // It handles squashed numbers (e.g. 1024.0075776.00) perfectly by requiring the \.d{2} boundaries.
  const blockRegex = /([A-Z]{3}\/[A-Z0-9]+\/[\d.:X]+\/\d+\/[\d.]+)(?:[\s\S]{0,100}?)(48109200)(?:[\s\S]{0,100}?)([\d,]+\.\d{2})\s*([\d,]+\.\d{2})\s*(SW[A-Z0-9]{2,5})/g;

  while ((match = blockRegex.exec(text)) !== null) {
    dataBlocks.push({
      materialCode: match[1],
      hsnCode: match[2],
      qty: cleanQty(match[3]),
      amount: cleanAmount(match[4]),
      routeCode: match[5]
    });
  }

  const items = [];
  const maxLen = Math.min(poRefs.length, dataBlocks.length);

  // Zip the lists together sequentially
  for (let i = 0; i < maxLen; i++) {
    const ref = poRefs[i];
    const block = dataBlocks[i];

    const brandPrefix = block.materialCode.slice(0, 3);
    const description = buildDescription(brandPrefix, ref.gsm, block.materialCode);

    const ratePerKg = block.qty > 0 ? (block.amount / block.qty) : 0;

    items.push({
      lineNo: ref.lineNo,
      fullLineRef: ref.fullLineRef,
      itemBrand: `${brandPrefix} - ${BRAND_CODE_MAP[brandPrefix]?.fullName || brandPrefix} ${ref.gsm} GSM`,
      brand: `${brandPrefix} - ${BRAND_CODE_MAP[brandPrefix]?.fullName || brandPrefix}`,
      materialCode: block.materialCode,
      description: description,
      hsnCode: block.hsnCode,
      noPackages: "", // Variable, unneeded for Tally processing
      quantityKg: block.qty,
      unit: "Kgs",
      amount: block.amount,
      ratePerKg: Math.round(ratePerKg * 100) / 100,
      routeCode: block.routeCode,
      fscType: ""
    });
  }

  return items;
}

function parseSalesforcePO(text) {
  // Strip hard returns to normalize layout strings
  const cleanText = text.replace(/\r/g, "");

  // ── Header fields ────────────────────────────────────────────────────────
  const poNumber      = findAny(cleanText, [/Purchase Order No:\s*(\S+)/i, /(\S+)\s+Purchase Order No:/i]);
  const internalPONo  = findAny(cleanText, [/Internal Customer PO NO:\s*(\S+)/i, /(\S+)\s+Internal Customer PO NO:/i]);
  const documentDate  = findAny(cleanText, [/Document Date:\s*([\d]{4}-[\d]{2}-[\d]{2})/i, /([\d]{4}-[\d]{2}-[\d]{2})\s+Document Date:/i]);
  const deliveryDate  = findAny(cleanText, [/Requested Delivery Date:\s*([\d]{4}-[\d]{2}-[\d]{2})/i, /([\d]{4}-[\d]{2}-[\d]{2})\s+Requested Delivery Date:/i]);

  const orderType     = findAny(cleanText, [/Order Type\s*:\s*(.+?)(?:\n|$)/i]) || "JKPL Domestic Sales";
  const distChannel   = findAny(cleanText, [/Distribution Channel\s*:\s*(.+?)(?:\n|$)/i]) || "32 - Direct";
  const plantDepot    = findAny(cleanText, [/Plant Depot:\s*(.+?)(?:\n|$)/i]) || "2200 - JK PAPER LIMITED";
  const paymentTerms  = findAny(cleanText, [/Payment Terms:\s*(.+?)(?:\n|$)/i]);
  const insurance     = findAny(cleanText, [/Insurance:\s*(.+?)(?:\n|$)/i]);
  const transportMode = findAny(cleanText, [/Mode Of Transport:\s*(.+?)(?:\n|$)/i]);
  const deliveryTo    = findAny(cleanText, [/Delivery To:\s*(.+?)(?:\n|$)/i]);

  // ── GSTINs & PANs ────────────────────────────────────────────────────────
  // Dynamically map all GSTIN/PAN patterns found and assign the first to Bill To, the last to Ship To
  const allGSTINs   = [...cleanText.matchAll(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Zz][0-9A-Z]{1}/g)].map(m => m[0]);
  const billToGSTIN = allGSTINs[0] || "";
  const shipToGSTIN = allGSTINs.filter(g => g !== billToGSTIN).pop() || allGSTINs[allGSTINs.length - 1] || "";

  const allPANs = [...cleanText.matchAll(/[A-Z]{5}[0-9]{4}[A-Z]{1}/g)].map(m => m[0]);
  const billToPAN = allPANs[0] || "";
  const shipToPAN = allPANs.filter(p => p !== billToPAN).pop() || allPANs[allPANs.length - 1] || "";

  // ── Addresses ────────────────────────────────────────────────────────────
  const addresses = [...cleanText.matchAll(/Address:\s*([\s\S]+?)(?:GSTIN|PAN)/g)].map(m => m[1].replace(/\s+/g, " ").trim());
  const billToAddress = addresses[0] || "219, Podar Chambers, 109, S.A. Brelvi Road, Fort, Mumbai - 400 001";
  const shipToAddress = addresses[addresses.length - 1] || "";

  const shipToNo      = findAny(cleanText, [/Ship To Party No:\s*(\d+)/i]);
  const shipToNameRaw = findAny(cleanText, [/Ship To Party Name:\s*\d+\s*-\s*(.+?)(?:\n|$)/i]);
  const shipToName    = shipToNameRaw.split('-')[0].trim() || "BORKAR PACKAGING";

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalQtyKg  = cleanQty(findAny(cleanText, [/Total Quantity \(kg\)\s*:\s*([\d,\.]+)/i, /([\d,\.]+)\s*Total Quantity \(kg\)/i]));
  const totalAmount = cleanAmount(findAny(cleanText, [/Total Amount:\s*([\d,\.]+)/i, /([\d,\.]+)\s*Total Amount/i]));

  const billToState = deriveStateFromGSTIN(billToGSTIN);
  const shipToState = deriveStateFromGSTIN(shipToGSTIN);
  const gstType     = determineGSTType(billToGSTIN, shipToGSTIN);

  // ── Execute Zip Parse ────────────────────────────────────────────────────
  const lineItems = parsePOLineItems(cleanText);

  return {
    source: "SALESFORCE",
    header: {
      poNumber, internalPONo, documentDate, deliveryDate, orderType,
      distChannel, plantDepot, paymentTerms, insurance, transportMode, deliveryTo
    },
    billTo: {
      partyName: "BHARAT PAPER MART",
      address: billToAddress,
      email: "bharatpapermart@gmail.com",
      gstin: billToGSTIN, pan: billToPAN,
      stateName: billToState.stateName, stateCode: billToState.stateCode
    },
    shipTo: {
      partyNo: shipToNo, partyName: shipToName, address: shipToAddress,
      gstin: shipToGSTIN, pan: shipToPAN,
      stateName: shipToState.stateName, stateCode: shipToState.stateCode
    },
    lineItems,
    totals: { totalQtyKg, totalAmount, gstType }
  };
}

module.exports = { parseSalesforcePO };