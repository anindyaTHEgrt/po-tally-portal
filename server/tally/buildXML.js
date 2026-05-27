/**
 * buildXML.js
 * Converts unified merged PO JSON into TallyPrime-compatible XML.
 *
 * FIXES v5:
 *  1. OBJVIEW = "Invoice Voucher View" (not "Order Voucher View")
 *  2. ALLINVENTORYENTRIES.LIST (not INVENTORYENTRIES.LIST)
 *  3. ACTUALQTY/BILLEDQTY with " KGS" suffix e.g. " 1024.00 KGS"
 *  4. UDF fields renamed: AWTSPECIALRATE + AWTBATCHREELSHEET, inside BATCHALLOCATIONS
 *  5. ORDERNO + INDENTNO + TRACKINGNUMBER + DYNAMICCSTISCLEARED in BATCHALLOCATIONS
 *  6. PARTYGSTIN + PLACEOFSUPPLY + CMPGSTIN + STATENAME + NUMBERINGSTYLE on voucher
 *  7. EFFECTIVEDATE added to voucher header
 *  8. PURCHASE_LEDGER default updated to PURCHASE JK (INTERSTATE)
 *  9. GST ledger entries removed from voucher (Purchase Orders don't carry tax entries)
 */

const TALLY_COMPANY    = process.env.TALLY_COMPANY    || "BPM TEST";
const TALLY_GSTIN      = process.env.TALLY_GSTIN      || "27AAJFB0186H1ZH";
const TALLY_STATE      = process.env.TALLY_STATE      || "Maharashtra";
const PURCHASE_LEDGER  = process.env.PURCHASE_LEDGER  || "PURCHASE JK (INTERSTATE)";
const IGST_LEDGER      = process.env.IGST_LEDGER      || "IGST";
const CGST_LEDGER      = process.env.CGST_LEDGER      || "CGST";
const SGST_LEDGER      = process.env.SGST_LEDGER      || "SGST";

// ── Date utilities ────────────────────────────────────────────────────────────

function formatDateForTally(val) {
    if (val instanceof Date && !isNaN(val)) return dateToTally(val);
    if (!val) return todayTally();
    const s = String(val).trim();
    if (/^\d{8}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s);
        return isNaN(d) ? todayTally() : dateToTally(d);
    }
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}${dmy[2].padStart(2,"0")}${dmy[1].padStart(2,"0")}`;
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) return `${mdy[3]}${mdy[1].padStart(2,"0")}${mdy[2].padStart(2,"0")}`;
    const d = new Date(s);
    return isNaN(d) ? todayTally() : dateToTally(d);
}

function dateToTally(d) {
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function todayTally() {
    return dateToTally(new Date());
}

// ── JK Stock Groups ───────────────────────────────────────────────────────────
const JK_STOCK_GROUPS = [
    "JK AQUA TUB BOARD","JK ARSR STIFFNER","JK ART PAPER","JK BRAILLE PAPER",
    "JK CARRY","JK CARRY BAG 50.0","JK CARRY SHEET","JK CIGARETTE BOARD ( CIG )",
    "JK CLUB CARD","JK COATED BD - PUREFIL BASE","JK COATED CARTON BOARD",
    "JK COTE ART PAPER","JK COTE PREMIUM PAPER","JK CPM CUP BOTTOM",
    "JK CPM PUREFIL WALL","JK CPM PUREFIL WALL LOWER GSM","JK CUP STOCK BASE",
    "JK DIVINE","JK EASY COPIER","JK EASY DRAW","JK EASY FOLD GC2",
    "JK ECO GREEN PUREFIL","JK ECO GREEN PUREFIL ( P2G )","JK ECO GREEN TUFF FREEZE",
    "JK ELEKTRA PAPER","JK ENDURA BOARD","JK ENVELOPE - BUFF SHADE )",
    "JK FAB PRINT","JK FINESSE PAPER","JK FINESSE PREMIUM PRINTING","JK FRC BOARD",
    "JK GREY BACK BOARD","JK INDEX","JK INDUCTION WADS BOARD","JK IV BOARD",
    "JK KRAFT WRAPPER","JK MAPLITHO - NS","JK MAPLITHO PAPER",
    "JK MAPLITHO PAPER ( LOWER GSM )","JK MAX","JK MICR PAPER",
    "JK NEO PUREFIL ( CLAY COATED )","JK NEO PUREFILL ( CLAY COATED )",
    "JK OGR PAPER","JK P1P_PUREFIL","JK PAPER","JK PARCHMENT - NS",
    "JK PHARMA PRINT NATURAL SHADE","JK PLATINA BOARD","JK POLY COATED BOARD",
    "JK POLY COATED MAPLITHO","JK POLYCOATED TUFFPACK BOARD","JK POLYCOATED ULTIMA BOARD",
    "JK PRISTINECOTE ( PNT )","JK SIRPUR 88.0 CMS PUREFIL","JK SIRPUR CUP BOTTOM",
    "JK SIRPUR CUP BOTTOM ( LOWER GSM )","JK SIRPUR CUP STOCK BOTTOM",
    "JK SIRPUR ECO GREEN PUREFIL","JK SIRPUR PUREFIL","JK SIRPUR PUREFIL 88.0 CMS",
    "JK SIRPUR PUREFIL HIGHER GSM","JK SIRPUR UNCOATED BD - PUREFIL BASE BOTTOM",
    "JK SIRPUR UNCOATED BD-PUREFIL BASE WALL","JK SIRPUR VIRGIN KRAFT PAPER",
    "JK SIRPUR WHITE HIGHBRIGHT PLUS","JK SPARKLE COPIER","JK STIFFNER ( NS )",
    "JK STIFFNER HIGH WAX","JK STIFFNER MAPLITHO","JK STIFFNER NS ( HIGHER GSM )",
    "JK TARAL PACK","JK TUFFCOTE ANTIFUNGAL","JK TUFFCOTE BOARD","JK TUFFPACK BOARD",
    "JK ULTIMA ( VIRGIN ) BOARD","JK ULTIMA ( VIRGIN COATED ) BOATED",
    "JK ULTIMA ( VIRGIN CTD.) BOARD","JK ULTIMA BOARD","JK ULTRA PRINT",
    "JK UNCOATED - SS HIGHER GSM BOARD","JK UNCOATED - SS LOWER GSM BOARD",
    "JK UNCOATED BD - PUREFIL BASE","JK UNCOATED BD - PUREFIL BASE BOTTOM",
    "JK UNCOATED BD-PUREFIL BASE WALL","JK UNCOATED BD-PUREFIL BASE WALL - FSC",
    "JK UNCOATED BD-PUREFIL BASE WALL HIGHER GSM","JK UNCOATED BD-PUREFIL WALL LOWER GSM",
    "JK UNCOATED BOARD",
];

const NOISE = new Set(["JK","THE","A","AN","OF","AND","IN","ON"]);

function resolveJKStockGroup(description) {
    if (!description) return "JK PAPER";
    const descUpper = description.toUpperCase().trim();
    for (const group of JK_STOCK_GROUPS) {
        if (descUpper.startsWith(group.toUpperCase())) return group;
    }
    let bestGroup = "JK PAPER", bestScore = 0;
    for (const group of JK_STOCK_GROUPS) {
        const words = group.toUpperCase().split(/[\s\-(),./]+/).filter((w) => w.length > 1 && !NOISE.has(w));
        const score = words.reduce((acc, w) => acc + (descUpper.includes(w) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; bestGroup = group; }
    }
    return bestScore > 0 ? bestGroup : "JK PAPER";
}

function xmlEscape(val) {
    if (val === null || val === undefined) return "";
    return String(val)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

// ── Master builders ───────────────────────────────────────────────────────────

function buildLedgerXML(party) {
    return `
<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <LEDGER NAME="${xmlEscape(party.partyName)}" ACTION="Create">
    <NAME>${xmlEscape(party.partyName)}</NAME>
    <PARENT>Sundry Creditors</PARENT>
    <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
    <PARTYGSTIN>${xmlEscape(party.gstin)}</PARTYGSTIN>
    <PANNO>${xmlEscape(party.pan)}</PANNO>
    <STATENAME>${xmlEscape(party.stateName)}</STATENAME>
    <COUNTRYNAME>India</COUNTRYNAME>
    <MAILINGNAME>${xmlEscape(party.partyName)}</MAILINGNAME>
    <ADDRESS.LIST TYPE="Address">
      <ADDRESS>${xmlEscape(party.address)}</ADDRESS>
    </ADDRESS.LIST>
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="Name"><NAME>${xmlEscape(party.partyName)}</NAME></NAME.LIST>
      <LANGUAGEID>1033</LANGUAGEID>
    </LANGUAGENAME.LIST>
  </LEDGER>
</TALLYMESSAGE>`.trim();
}

function buildStockItemXML(item) {
    const stockGroup = resolveJKStockGroup(item.description);
    return `
<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <STOCKITEM NAME="${xmlEscape(item.description)}" ACTION="Create">
    <NAME>${xmlEscape(item.description)}</NAME>
    <PARENT>${xmlEscape(stockGroup)}</PARENT>
    <CATEGORY></CATEGORY>
    <BASEUNITS>KGS</BASEUNITS>
    <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
    <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
    <HSNCODE>${xmlEscape(item.hsnCode)}</HSNCODE>
    <TAXABILITY>Taxable</TAXABILITY>
    <INTEGRATDTAX>${item.gstRatePct || 18}</INTEGRATDTAX>
    <CESS>0</CESS>
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="Name"><NAME>${xmlEscape(item.description)}</NAME></NAME.LIST>
      <LANGUAGEID>1033</LANGUAGEID>
    </LANGUAGENAME.LIST>
  </STOCKITEM>
</TALLYMESSAGE>`.trim();
}

// ── Voucher builder ───────────────────────────────────────────────────────────

function buildPurchaseOrderXML(data) {
    const { header, billTo, shipTo, supplier, lineItems, totals } = data;
    const company        = data.tallyCompany    || TALLY_COMPANY;
    const cmpGstin       = data.tallyGstin      || TALLY_GSTIN;
    const cmpState       = data.tallyState      || TALLY_STATE;
    const purchaseLedger = data.purchaseLedger  || PURCHASE_LEDGER;

    const tallyDate    = formatDateForTally(header.date);
    const tallyDueDate = formatDateForTally(header.deliveryDate);
    const voucherNo    = xmlEscape(header.voucherNo);

    console.log(`📅 Voucher date: ${tallyDate}  Due: ${tallyDueDate}  (raw: ${header.date} / ${header.deliveryDate})`);

    // ── Inventory lines ───────────────────────────────────────────────────────
    const inventoryLines = lineItems.map((item) => `
        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${xmlEscape(item.description)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
          <ISAUTONEGATE>No</ISAUTONEGATE>
          <RATE>${item.ratePerKg}</RATE>
          <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
          <ACTUALQTY> ${item.quantityKg}.00 KGS</ACTUALQTY>
          <BILLEDQTY> ${item.quantityKg}.00 KGS</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>Main Location</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <INDENTNO>&#4; Not Applicable</INDENTNO>
            <ORDERNO>${voucherNo}</ORDERNO>
            <TRACKINGNUMBER>&#4; Not Applicable</TRACKINGNUMBER>
            <DYNAMICCSTISCLEARED>No</DYNAMICCSTISCLEARED>
            <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
            <ACTUALQTY> ${item.quantityKg}.00 KGS</ACTUALQTY>
            <BILLEDQTY> ${item.quantityKg}.00 KGS</BILLEDQTY>
            <ORDERDUEDATE>${tallyDueDate}</ORDERDUEDATE>
            <UDF:AWTSPECIALRATE.LIST DESC="\`AWTSpecialRate\`" ISLIST="YES" TYPE="Number" INDEX="50001">
              <UDF:AWTSPECIALRATE DESC="\`AWTSpecialRate\`"> 0</UDF:AWTSPECIALRATE>
            </UDF:AWTSPECIALRATE.LIST>
            <UDF:AWTBATCHREELSHEET.LIST DESC="\`AWTBatchReelSheet\`" ISLIST="YES" TYPE="String" INDEX="51007">
              <UDF:AWTBATCHREELSHEET DESC="\`AWTBatchReelSheet\`">Sheet</UDF:AWTBATCHREELSHEET>
            </UDF:AWTBATCHREELSHEET.LIST>
          </BATCHALLOCATIONS.LIST>
          <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${xmlEscape(purchaseLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
          </ACCOUNTINGALLOCATIONS.LIST>
        </ALLINVENTORYENTRIES.LIST>`).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER ACTION="Create" OBJVIEW="Invoice Voucher View">
            <BASICORDERTERMS.LIST TYPE="String">
            <BASICORDERTERMS>${xmlEscape(header.termsOfDelivery)}</BASICORDERTERMS>
            </BASICORDERTERMS.LIST>
            <DATE>${tallyDate}</DATE>
            <EFFECTIVEDATE>${tallyDate}</EFFECTIVEDATE>
            <GUID>PO-${voucherNo}-${Date.now()}</GUID>
            <VOUCHERTYPENAME>Purchase Order</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucherNo}</VOUCHERNUMBER>
            <REFERENCE>${voucherNo}</REFERENCE>
            <PARTYLEDGERNAME>${xmlEscape(supplier.name)}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <PARTYGSTIN>${xmlEscape(cmpGstin)}</PARTYGSTIN>
            <PLACEOFSUPPLY>${xmlEscape(cmpState)}</PLACEOFSUPPLY>
            <CMPGSTIN>${xmlEscape(cmpGstin)}</CMPGSTIN>
            <STATENAME>${xmlEscape(cmpState)}</STATENAME>
            <NUMBERINGSTYLE>Manual</NUMBERINGSTYLE>
            <BASICBASEPARTYNAME>${xmlEscape(billTo.partyName)}</BASICBASEPARTYNAME>
            <BASICBUYERNAME>${xmlEscape(shipTo.partyName)}</BASICBUYERNAME>
            <BASICFINALDESTINATION>${xmlEscape(header.destination)}</BASICFINALDESTINATION>
            <BASICDUEDATEOFPYMT>${xmlEscape(header.paymentTerms)}</BASICDUEDATEOFPYMT>
            <CONSIGNEENAME>${xmlEscape(shipTo.partyName)}</CONSIGNEENAME>
            <CONSIGNEEGSTIN>${xmlEscape(shipTo.gstin)}</CONSIGNEEGSTIN>
            <CONSIGNEESTATENAME>${xmlEscape(shipTo.stateName)}</CONSIGNEESTATENAME>
            <NARRATION>PO Ref: ${xmlEscape(header.sfPORef)} | Supplier: ${xmlEscape(supplier.name)} | Delivery: ${xmlEscape(header.destination)} | Payment: ${xmlEscape(header.paymentTerms)}</NARRATION>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(billTo.partyName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${totals.grandTotal.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
            ${inventoryLines}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ── Masters envelope ──────────────────────────────────────────────────────────

function buildMastersXML(data) {
    const { billTo, lineItems } = data;
    const company = data.tallyCompany || TALLY_COMPANY;

    const ledgerMessage = buildLedgerXML(billTo);

    const seen = new Set();
    const stockMessages = lineItems
        .filter((i) => { if (seen.has(i.description)) return false; seen.add(i.description); return true; })
        .map((i) => buildStockItemXML({ description: i.description, hsnCode: i.hsnCode || "", gstRatePct: i.gstRatePct || 18 }))
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${ledgerMessage}
        ${stockMessages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

module.exports = {
    buildPurchaseOrderXML,
    buildMastersXML,
    buildStockItemXML,
    resolveJKStockGroup,
    formatDateForTally,
    xmlEscape,
    TALLY_COMPANY,
};