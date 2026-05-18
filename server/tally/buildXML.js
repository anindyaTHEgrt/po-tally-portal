/**
 * buildXML.js
 * Converts the unified merged PO JSON into TallyPrime-compatible XML.
 * Targets: Purchase Order voucher with auto-master creation support.
 */

const { formatDateForTally } = require("../parser/utils");

const TALLY_COMPANY = "Bluecoast Meridian";

/**
 * Escapes special XML characters in a string value.
 * @param {string} val
 * @returns {string}
 */
function xmlEscape(val) {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds Tally XML for creating a party ledger (Bill To / Vendor).
 * @param {object} party
 * @returns {string}
 */
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
    <PINCODE></PINCODE>
    <COUNTRYNAME>India</COUNTRYNAME>
    <MAILINGNAME>${xmlEscape(party.partyName)}</MAILINGNAME>
    <ADDRESS.LIST TYPE="Address">
      <ADDRESS>${xmlEscape(party.address)}</ADDRESS>
    </ADDRESS.LIST>
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="Name">
        <NAME>${xmlEscape(party.partyName)}</NAME>
      </NAME.LIST>
      <LANGUAGEID>1033</LANGUAGEID>
    </LANGUAGENAME.LIST>
  </LEDGER>
</TALLYMESSAGE>`.trim();
}

/**
 * Builds Tally XML for creating a stock item.
 * @param {object} item  A line item from the merged JSON
 * @returns {string}
 */
function buildStockItemXML(item) {
  return `
<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <STOCKITEM NAME="${xmlEscape(item.description)}" ACTION="Create">
    <NAME>${xmlEscape(item.description)}</NAME>
    <PARENT>Primary</PARENT>
    <CATEGORY></CATEGORY>
    <BASEUNITS>Kgs</BASEUNITS>
    <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
    <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
    <HSNCODE>${xmlEscape(item.hsnCode)}</HSNCODE>
    <TAXABILITY>Taxable</TAXABILITY>
    <INTEGRATDTAX>${item.gstRatePct || 18}</INTEGRATDTAX>
    <CESS>0</CESS>
  </STOCKITEM>
</TALLYMESSAGE>`.trim();
}

/**
 * Builds the main Purchase Order voucher XML.
 * @param {object} data  Merged PO JSON from mergePO.js
 * @returns {string}     Full Tally XML envelope string
 */
function buildPurchaseOrderXML(data) {
  const { header, billTo, shipTo, supplier, lineItems, totals } = data;

  const tallyDate = formatDateForTally(header.date);

  // ── Line item inventory entries ────────────────────────────────────────────
  const inventoryLines = lineItems.map((item) => `
      <INVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${xmlEscape(item.description)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${item.ratePerKg}/Kgs</RATE>
        <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
        <ACTUALQTY>${item.quantityKg} Kgs</ACTUALQTY>
        <BILLEDQTY>${item.quantityKg} Kgs</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>Main Location</GODOWNNAME>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
          <ACTUALQTY>${item.quantityKg} Kgs</ACTUALQTY>
          <BILLEDQTY>${item.quantityKg} Kgs</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
        <ACCOUNTINGALLOCATIONS.LIST>
          <LEDGERNAME>Purchase Account</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
        </ACCOUNTINGALLOCATIONS.LIST>
      </INVENTORYENTRIES.LIST>`).join("");

  // ── GST ledger entry ──────────────────────────────────────────────────────
  const gstLedgerName = totals.gstType === "IGST" ? "IGST" : "CGST";
  const gstEntry = totals.gstType === "IGST"
    ? `
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>IGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${totals.taxAmount.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>`
    : `
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>CGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${(totals.taxAmount / 2).toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>SGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${(totals.taxAmount / 2).toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>`;

  // ── Full envelope ─────────────────────────────────────────────────────────
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
          <SVCURRENTCOMPANY>${xmlEscape(TALLY_COMPANY)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER ACTION="Create" OBJVIEW="Purchase Order View">
            <DATE>${tallyDate}</DATE>
            <GUID>PO-${xmlEscape(header.voucherNo)}-${Date.now()}</GUID>
            <VOUCHERTYPENAME>Purchase Order</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(header.voucherNo)}</VOUCHERNUMBER>
            <REFERENCE>${xmlEscape(header.sfPORef)}</REFERENCE>
            <PARTYLEDGERNAME>${xmlEscape(billTo.partyName)}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Purchase Order View</PERSISTEDVIEW>
            <NARRATION>PO Ref: ${xmlEscape(header.sfPORef)} | Supplier: ${xmlEscape(supplier.name)} | Delivery To: ${xmlEscape(header.destination)} | Payment: ${xmlEscape(header.paymentTerms)}</NARRATION>
            <ORDERDUEDATE>${formatDateForTally(header.deliveryDate)}</ORDERDUEDATE>
            <BASICBASEPARTYNAME>${xmlEscape(billTo.partyName)}</BASICBASEPARTYNAME>
            <BASICBUYERNAME>${xmlEscape(shipTo.partyName)}</BASICBUYERNAME>
            <BASICSHIPDELIVERYNAME>${xmlEscape(header.destination)}</BASICSHIPDELIVERYNAME>
            <CONSIGNEENAME>${xmlEscape(shipTo.partyName)}</CONSIGNEENAME>
            <CONSIGNEEGSTIN>${xmlEscape(shipTo.gstin)}</CONSIGNEEGSTIN>
            <CONSIGNEESTATENAME>${xmlEscape(shipTo.stateName)}</CONSIGNEESTATENAME>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(billTo.partyName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${totals.grandTotal.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
            ${gstEntry}
            ${inventoryLines}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds XML to create all required masters (ledgers + stock items) before the voucher.
 * @param {object} data  Merged PO JSON
 * @returns {string}     Tally XML envelope for master creation
 */
function buildMastersXML(data) {
  const { billTo, lineItems } = data;

  const ledgerMessages  = buildLedgerXML(billTo);
  const stockMessages   = [...new Set(lineItems.map((i) => i.description))]
    .map((desc) => buildStockItemXML({ description: desc, hsnCode: lineItems.find(i => i.description === desc)?.hsnCode || "", gstRatePct: 18 }))
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
          <SVCURRENTCOMPANY>${xmlEscape(TALLY_COMPANY)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${ledgerMessages}
        ${stockMessages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

module.exports = { buildPurchaseOrderXML, buildMastersXML, xmlEscape };
