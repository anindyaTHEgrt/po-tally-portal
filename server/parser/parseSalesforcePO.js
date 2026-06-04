/**
 * parseSalesforcePO.js
 * Robust parser utilizing a sequential "Zip" method.
 * Extracts PO references and Material Data blocks independently from the raw
 * string and merges them, completely avoiding line-break and spacing issues.
 */

const { deriveStateFromGSTIN, determineGSTType } = require("./utils");

const BRAND_CODE_MAP = {
  // ── Existing Base Codes ─────────────────────────────────────────
  FBD: { tallyCode: "TC",    fullName: "JK TUFFCOTE" },
  CPB: { tallyCode: "PL",    fullName: "JK PLATINA"  },
  CBB: { tallyCode: "UL",    fullName: "JK ULTIMA"   },

  // ── Expanded from Catalogue Defaults & CSV Keywords ───────────────────────
  F1P: { tallyCode: "F1P",   fullName: "TUFF FREEZE" },            // Covers 1 PE COATED BOARD
  CIG: { tallyCode: "CIG",   fullName: "JK CIGARETTE BOARD" },     // Mapped to CIG from CSV
  CSB: { tallyCode: "CSB",   fullName: "CSB UNCOATED" },
  FBS: { tallyCode: "FBS",   fullName: "FBS SURFACE SIZED" },
  FSG: { tallyCode: "AT",    fullName: "JK AQUA TUB" },            // Mapped to AT from CSV
  IVB: { tallyCode: "IVB",   fullName: "JK IV BOARD" },
  JCC: { tallyCode: "CC",    fullName: "JK CLUB CARD" },           // Mapped to CC from CSV
  KSG: { tallyCode: "KSG",   fullName: "ECOGREEN NEO" },
  LPB: { tallyCode: "JTP",   fullName: "JK TARAL PAC" },           // Mapped to JTP from CSV
  PDG: { tallyCode: "EGP2G", fullName: "PUREFILL P2G" },           // Mapped to EGP2G from CSV
  PNH: { tallyCode: "PNH",   fullName: "JK EASY FOLD" },           // Mapped to PNH from CSV
  PSG: { tallyCode: "PSG",   fullName: "PUREFILL P1G" },
  TAF: { tallyCode: "TCAF",  fullName: "JK TUFFCOTE ANTI FUNGAL" },// Mapped to TCAF from CSV
  TFP: { tallyCode: "TP",    fullName: "JK TUFFPACK" },            // Mapped to TP from CSV
  VFL: { tallyCode: "VFL",   fullName: "AKS-SPARK" },
};

/**
 * Safely parses floats, converting OCR comma decimals (e.g., 300000,00) to dots.
 */
function parseSafeFloat(str) {
  if (!str) return 0;
  const normalized = str.replace(/,(\d{2})$/, ".$1");
  return parseFloat(normalized.replace(/,/g, "")) || 0;
}

/**
 * Builds the exact Tally nomenclature description.
 */
function buildDescription(brandPrefix, gsm, materialCode) {
  const entry = BRAND_CODE_MAP[brandPrefix];
  const code  = entry ? entry.tallyCode : brandPrefix;
  const name  = entry ? entry.fullName  : brandPrefix;

  const safeMatCode = materialCode.replace(/:/g, ".");

  // Detect pallet / bundle packing — triggers " - PALLETS" suffix
  const isPallets = /\/(PLT|BDL)\//i.test(safeMatCode);

  const sheetM = safeMatCode.match(/([\d.]+)X([\d.]+)/);
  if (sheetM) {
    const fmt = n => parseFloat(n).toFixed(1);
    const base = `${code} - ${gsm} GSM - ${fmt(sheetM[1])} X ${fmt(sheetM[2])}`;
    return isPallets ? `${base} - PALLETS` : base;
  }

  const reelM = safeMatCode.match(/\/REL\/([\d.]+)\//);
  if (reelM) {
    const w = parseFloat(reelM[1]);
    const ws = w % 1 === 0 ? w.toFixed(1) : w.toString();
    return `${code} - ${gsm} GSM - ${ws} IN REELS`;
  }

  const base = `${name} ${gsm} GSM`;
  return isPallets ? `${base} - PALLETS` : base;
}

/**
 * Helper to match fields from a prioritized array of regexes.
 * This handles both standard (Label: Value) and inverted (Value Label:) formats.
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
  console.log("\n=== STARTING LINE ITEM PARSING ===");

  // 1. Check for PO References
  const poRefs = [];
  const poRegex = /(PO\d+-\d{3})/g;
  let match;

  while ((match = poRegex.exec(text)) !== null) {
    const fullLineRef = match[1];
    const lineNo = fullLineRef.split("-").pop();
    const forwardText = text.slice(match.index, match.index + 150);
    const gsmMatch = forwardText.match(/(\d{3})\s*GSM/i);
    const gsm = gsmMatch ? gsmMatch[1] : "300";
    poRefs.push({ fullLineRef, lineNo, gsm });
    console.log(`[DEBUG] Found PO Ref: ${fullLineRef} (GSM: ${gsm})`);
  }
  console.log(`[DEBUG] Total PO Refs found: ${poRefs.length}`);

  // 2. Pre-check: Does the text even contain the Material Codes?
  const materialCodeOnlyRegex = /([A-Z]{2,4}\/[A-Z0-9-]+\/[\d.:X]+\/\d+\/[\d.]+)/g;
  const foundMaterials = [...text.matchAll(materialCodeOnlyRegex)];
  console.log(`\n[DEBUG] Found ${foundMaterials.length} raw material codes in text.`);
  foundMaterials.forEach((m, i) => console.log(`  -> Material ${i + 1}: ${m[1]}`));

  // 3. The Strict Block Regex (The one that is currently failing)
  const dataBlocks = [];

  // THE FINAL REGEX:
  // 1. Mat Code (Group 1): Relaxed decimals (?:[.:]\d{1,2})? but capped weight to \d{1,4} to stop bleeding.
  //    Now safely captures 305, 30.5, and 16.00.
  // 2. HSN (Group 2): Strictly anchored to 8 digits (\d{8}).
  // 3. FSC Gap (Group 3): (FSC\D*(?:\d{1,3}%\D*)?|\D{0,50}?) strictly forbids eating the 600 from 6000.00.
  // 4. Qty/Amt (Groups 4 & 6): Strictly 2 decimals, strictly forbids leading zeros.
  const blockRegex = /([A-Z]{3}\/[A-Z0-9-]+\/[\d.:X]+(?:\/\d+\/\d{1,4}(?:[.:]\d{1,2})?)?)(?:[\s\S]{0,50}?)(\d{8})(FSC\D*(?:\d{1,3}%\D*)?|\D{0,50}?)([1-9][\d,]*[.,]\d{2}|0[.,]\d{2})(\s*)([1-9][\d,]*[.,]\d{2}|0[.,]\d{2})(\s*)([A-Z0-9]{4,10})/gi;


  console.log("\n=== RUNNING STRICT BLOCK REGEX ===");
  let blockCount = 0;

  while ((match = blockRegex.exec(text)) !== null) {
    blockCount++;
    console.log(`\n[DEBUG] Block Match #${blockCount} Successful!`);
    console.log(`  -> Material Code: ${match[1]}`);
    console.log(`  -> HSN:           ${match[2]}`);
    console.log(`  -> Gap 1 (FSC):   ${JSON.stringify(match[3])}`);
    console.log(`  -> Quantity:      ${match[4]}`);
    console.log(`  -> Amount:        ${match[6]}`);
    console.log(`  -> Route:         ${match[8]}`);

    let fscType = "";
    const fscMatch = match[3].match(/(FSC[a-zA-Z\s]+)/i);
    if (fscMatch) {
      fscType = fscMatch[1].replace(/[\r\n",]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
    }

    dataBlocks.push({
      materialCode: match[1],
      hsnCode: match[2],
      fscType: fscType,
      qty: parseSafeFloat(match[4]),
      amount: parseSafeFloat(match[6]),
      routeCode: match[8]
    });
  }

  console.log(`\n[DEBUG] Total complete data blocks matched: ${dataBlocks.length}`);

  // 4. DIAGNOSTIC DUMP: If we found materials but the strict regex failed, dump the text.
  if (dataBlocks.length === 0 && foundMaterials.length > 0) {
    console.log("\n[ERROR] Material codes were found, but the strict regex failed to match the full row.");
    console.log("        This means the text structure between the Material Code and the Route Code");
    console.log("        does NOT match the expected quotes (\") or gap limits.");

    const firstMatIndex = text.indexOf(foundMaterials[0][1]);
    if (firstMatIndex !== -1) {
      console.log("\n=== DIAGNOSTIC TEXT DUMP (300 chars after first material code) ===");
      // stringify will reveal hidden newline \n and quote " characters
      console.log(JSON.stringify(text.substring(firstMatIndex, firstMatIndex + 300)));
      console.log("==================================================================\n");
    }
  }

  // 5. Final Mapping
  const items = [];
  const maxLen = Math.min(poRefs.length, dataBlocks.length);

  for (let i = 0; i < maxLen; i++) {
    const ref = poRefs[i];
    const block = dataBlocks[i];
    const brandPrefix = block.materialCode.slice(0, 3);

    let description = buildDescription(brandPrefix, ref.gsm, block.materialCode);
    if (block.fscType) description += ` - ${block.fscType}`;

    const ratePerKg = block.qty > 0 ? (block.amount / block.qty) : 0;

    items.push({
      lineNo: ref.lineNo,
      fullLineRef: ref.fullLineRef,
      itemBrand: `${brandPrefix} - ${BRAND_CODE_MAP[brandPrefix]?.fullName || brandPrefix} ${ref.gsm} GSM`,
      brand: `${brandPrefix} - ${BRAND_CODE_MAP[brandPrefix]?.fullName || brandPrefix}`,
      materialCode: block.materialCode,
      description: description,
      hsnCode: block.hsnCode,
      noPackages: "",
      quantityKg: block.qty,
      unit: "Kgs",
      amount: block.amount,
      ratePerKg: Math.round(ratePerKg * 100) / 100,
      routeCode: block.routeCode,
      fscType: block.fscType
    });
  }

  console.log("=== FINISHED LINE ITEM PARSING ===\n");
  return items;
}
function parseSalesforcePO(text) {
  const cleanText = text.replace(/\r/g, "");

  // ── Header fields ──────────────────────────────────────────────────────────

  const poNumber = findAny(cleanText, [
    /Purchase Order No\s*:\s*"?([A-Z0-9-]+)/i,
    /"?([A-Z0-9-]+)"?\s+Purchase Order No/i
  ]);

  // Disabled per user request for manual entry
  const internalPONo = "";

  const documentDate = findAny(cleanText, [
    /Document Date\s*:\s*([\d]{4}-[\d]{2}-[\d]{2})/i,
    /([\d]{4}-[\d]{2}-[\d]{2})\s+Document Date/i
  ]);

  const deliveryDate = findAny(cleanText, [
    /Requested Delivery Date\s*:\s*([\d]{4}-[\d]{2}-[\d]{2})/i,
    /([\d]{4}-[\d]{2}-[\d]{2})\s+Requested Delivery Date/i
  ]);

  const orderType = findAny(cleanText, [
    /Order Type\s*:\s*(.+?)(?=\s*Distribution Channel|\n|$)/i,
    /(?:^|\n)\s*(.+?)\s+Order Type/i
  ]) || "JKPL Domestic Sales";

  const distChannel = findAny(cleanText, [
    /Distribution Channel\s*:\s*(.+?)(?=\s*Plant Depot|\n|$)/i,
    /(?:^|\n)\s*(.+?)\s+Distribution Channel/i
  ]) || "32 - Direct";

  const plantDepot = findAny(cleanText, [
    /Plant Depot\s*:\s*(.+?)(?=\s*Internal Customer|\n|$)/i,
    /(?:^|\n)\s*(.+?)\s+Plant Depot/i
  ]) || "2200 - JK PAPER LIMITED";

  // Disabled per user request for manual entry
  const paymentTerms = "";

  const insurance = findAny(cleanText, [
    /Insurance\s*:\s*(.+?)(?=\s*Mode Of Transport|\n|$)/i,
    /(?:^|\n)\s*(.+?)\s+Insurance/i
  ]);

  const transportMode = findAny(cleanText, [
    /Mode Of Transport\s*:\s*(.+?)(?=\s*Delivery To|\n|$)/i,
    /(?:^|\n)\s*(.+?)\s+Mode Of Transport/i
  ]);

  // ── GSTINs & PANs ────────────────────────────────────────────────────────
  const allGSTINs   = [...cleanText.matchAll(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Zz][0-9A-Z]{1}/g)].map(m => m[0]);
  const billToGSTIN = allGSTINs[0] || "";
  const shipToGSTIN = allGSTINs.filter(g => g !== billToGSTIN).pop() || allGSTINs[allGSTINs.length - 1] || "";

  const allPANs = [...cleanText.matchAll(/[A-Z]{5}[0-9]{4}[A-Z]{1}/g)].map(m => m[0]);
  const billToPAN = allPANs[0] || "";
  const shipToPAN = allPANs.filter(p => p !== billToPAN).pop() || allPANs[allPANs.length - 1] || "";

  // ── Targeted Address Extraction ──────────────────────────────────────────
  const billToBlock = cleanText.match(/Bill To Party No:[\s\S]*?(?:Document Date|Requested Delivery)/i);
  let billToAddress = "219, Podar Chambers, 109, S.A. Brelvi Road, Fort, Mumbai - 400 001";
  if (billToBlock) {
    const bMatch = billToBlock[0].match(/Address:\s*([\s\S]+?)(?:GSTIN No:|PAN:)/i);
    if (bMatch) billToAddress = bMatch[1].replace(/\s+/g, " ").trim();
  }

  const shipToBlock = cleanText.match(/Ship To Party No:[\s\S]*?(?:The following table|Order Line No)/i);
  let shipToAddress = "";
  let shipToName = "BORKAR PACKAGING";
  let shipToNo = "";

  if (shipToBlock) {
    const sMatch = shipToBlock[0].match(/Address:\s*([\s\S]+?)(?:GSTIN No:|PAN:)/i);
    if (sMatch) shipToAddress = sMatch[1].replace(/\s+/g, " ").trim();

    const nMatch = shipToBlock[0].match(/Ship To Party Name:\s*\d+\s*-\s*([\s\S]+?)(?:Address:|-)/i);
    if (nMatch) shipToName = nMatch[1].replace(/\s+/g, " ").trim();

    const noMatch = shipToBlock[0].match(/Ship To Party No:\s*(\d+)/i);
    if (noMatch) shipToNo = noMatch[1];
  }

  // Delivery maps to the dynamically extracted Ship To Address
  let deliveryTo = findAny(cleanText, [/Delivery To:\s*(.+?)(?:\s*Wholeseller|\n|$)/i]);
  if (shipToAddress) {
    deliveryTo = shipToAddress;
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalQtyKg  = parseSafeFloat(findAny(cleanText, [/Total Quantity \(kg\)\s*:\s*([\d,\.]+)/i, /([\d,\.]+)\s*Total Quantity \(kg\)/i]));
  const totalAmount = parseSafeFloat(findAny(cleanText, [/Total Amount:\s*([\d,\.]+)/i, /([\d,\.]+)\s*Total Amount/i]));

  const billToState = deriveStateFromGSTIN(billToGSTIN);
  const shipToState = deriveStateFromGSTIN(shipToGSTIN);
  const gstType     = determineGSTType(billToGSTIN, shipToGSTIN);

  // ── Execute Zip Parse ────────────────────────────────────────────────────
  const lineItems = parsePOLineItems(cleanText);

  return {
    source: "SALESFORCE",
    header: {
      poNumber, internalPONo,
      documentDate,
      // deliveryDate = Document Date (PO due date in Tally); requestedDeliveryDate = original SF delivery date
      deliveryDate: documentDate,
      requestedDeliveryDate: deliveryDate,
      orderType,
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