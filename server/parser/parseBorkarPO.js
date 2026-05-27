/**
 * parseBorkarPO.js
 *
 * pdf-parse layout quirks for Borkar PO:
 *  - PO number is on the line AFTER "P.O. No. :" label: "BD/356/0/ 26.27"
 *  - Date is on line after "Date :" label
 *  - Line item description on its own line: "ENDURA TUFF COAT - JK - 300 GSM Size : 84.0 X 63.5 Cm"
 *  - Quantity/rate/amount scattered across following lines
 *  - " 5000.00 Kg" then "s" then " Rs 73.85" then "IGST@18.0000"
 *  - Amounts: "369,250.00\n66465.00\n66465.00\n435715.00"
 */

const { cleanAmount, cleanQty } = require("./utils");

function parseBorkarPO(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  function find(pat) {
    const m = text.match(pat);
    return m ? m[1].trim() : "";
  }

  // ── Issuer (Borkar) ────────────────────────────────────────────────────────
  const issuerGSTIN = find(/GSTIN No\.:\s*(30[A-Z0-9]+)/);
  const issuerPAN   = find(/PAN No\.:\s*([\w ]+?)(?:\n)/);
  const issuerPhone = find(/Phone:\s*([\(\d\)\s]+?)(?:\n)/);
  const issuerEmail = find(/E-mails:\s*(\S+)/);

  // ── PO Meta ────────────────────────────────────────────────────────────────
  // "P.O. No. :" is a label; value "BD/356/0/ 26.27" is on the NEXT line
  const poNumber    = find(/P\.O\. No\.\s*:\s*\n?(BD\/[\d\/\.\s]+?)(?:\n|Date)/);
  // "Date       :" label then "24/04/2026" on next line — grab either way
  const poDate      = find(/Date\s*:\s*\n?([\d\/]+)/);
  const termsOfDelivery = find(/Terms of Delivery\s*[:\-]?\s*\n?(.+?)(?:\n)/);

  const origDate    = find(/Original Date:\s*\n?([\d\/]+)/);
  const destination = find(/Destination\s*[:\-]\s*(.+?)(?:\n)/);

  // ── Vendor ─────────────────────────────────────────────────────────────────
  const vendorGSTIN = find(/GSTIN NO:\s*(27[A-Z0-9]+)/i);
  const vendorPAN   = find(/PAN NO\s*:\s*([\w]+)/i);
  const vendorPhone = find(/Ph No\.([\d]+)/i);
  const vendorEmail = find(/Email\s*:([\S]+)/i);

  // ── Line Items ─────────────────────────────────────────────────────────────
  // Description: "ENDURA TUFF COAT - JK - 300 GSM Size : 84.0 X 63.5 Cm"
  // Qty: " 5000.00 Kg" (then "s" on next line — split by pdf-parse)
  // Rate: " Rs 73.85"
  // IGST: "IGST@18.0000"
  // Amounts block: "369,250.00\n66465.00\n66465.00\n435715.00"
  const lineItems = [];

  const descLine = find(/\n(\d+)\.\n(ENDURA.+?)(?:\nDelivery Date)/s);
  // simpler: just find the ENDURA line directly
  const descMatch = text.match(/ENDURA TUFF COAT[^\n]+/);
  const description = descMatch ? descMatch[0].trim() : "";

  const qty         = cleanQty(find(/(\d[\d,\.]+)\s+Kg/));
  const rate        = parseFloat(find(/Rs\s+([\d\.]+)/)) || 0;
  const igstRate    = parseFloat(find(/IGST@([\d\.]+)/)) || 18;
  const baseAmt     = qty * rate;

  // Delivery info
  const deliveryDate = find(/Delivery Date\s*:\s*\n?([\d\/]+)/);
  const deliveryQty  = find(/Delivery Qty\s*:\s*\n?([\d,\.]+)/);

  if (description && qty > 0) {
    lineItems.push({
      srNo:        "1",
      description,
      quantity:    qty,
      unit:        "Kgs",
      ratePerUnit: rate,
      igstRatePct: igstRate,
      baseAmount:  Math.round(baseAmt * 100) / 100,
      deliveryDate,
    });
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const taxTotal   = cleanAmount(find(/Tax Total:\s*\n?([\d,\.]+)/));
  const subTotal   = cleanAmount(find(/Sub Total:\s*\n?([\d,\.]+)/));
  const grandTotal = cleanAmount(find(/Grand Total:\s*\n?([\d,\.]+)/));
  const amtWords   = find(/Rs\.:\s*\n?(.+?)(?:\n|Grand Total)/s);

  return {
    source: "BORKAR_EMAIL",
    issuer: {
      name:  "BORKAR PACKAGING PVT. LTD.",
      gstin: issuerGSTIN,
      pan:   issuerPAN.trim(),
      phone: issuerPhone.trim(),
      email: issuerEmail,
    },
    vendor: {
      name:  "BHARAT PAPER MART",
      gstin: vendorGSTIN,
      pan:   vendorPAN,
      phone: vendorPhone,
      email: vendorEmail,
    },
    poMeta: {
      poNumber:     poNumber.replace(/\s+/g, " ").trim(),
      date:         poDate,
      originalDate: origDate,
      termsOfDelivery,

    },
    lineItems,
    delivery: {
      deliveryDate,
      deliveryQty,
    },
    totals: {
      subTotal,
      taxTotal,
      grandTotal,
      amountInWords: amtWords.replace(/\s+/g, " ").trim(),
    },
  };
}

function parseParksons(text) {
  return {
    source: "PARKSONS_EMAIL",
    warning: "Parksons parser not yet implemented. Share a sample Parksons PO.",
    lineItems: [], totals: {}, poMeta: {}, issuer: {}, vendor: {}, delivery: {},
  };
}

module.exports = { parseBorkarPO, parseParksons };