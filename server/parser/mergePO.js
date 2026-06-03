/**
 * mergePO.js
 * Builds a unified Tally-ready JSON from the Salesforce PO alone.
 */

const DEFAULT_GST_RATE = 0.18;

// ── JK PAPER LTD. (UNIT CPM) supplier record ──────────────────────────────────
// Source: Tally ledger screenshot (Party Details panel)
const JK_PAPER_SUPPLIER = {
  name:      "JK PAPER LTD. (UNIT CPM)",
  gstin:     "24AAACT6305N2Z9",
  pan:       "AAACT6305N",
  address:   "P.O. CENTRAL PULP MILLS, FORT SONGADH, DIST:- TAPI ( GUJARAT )",
  stateName: "Gujarat",
  stateCode: "24",
  phone:     "",
  email:     "",
};

function mergePOData(sfData, gstRatePct = 18) {
  const GST_RATE = gstRatePct / 100;
  // ── Enrich SF line items ─────────────────────────────────────────────────
  const lineItems = sfData.lineItems.map((sfLine) => ({
    lineNo:       sfLine.lineNo,
    fullLineRef:  sfLine.fullLineRef,
    itemBrand:    sfLine.itemBrand,
    brand:        sfLine.brand,
    materialCode: sfLine.materialCode,
    description:  sfLine.description,
    hsnCode:      sfLine.hsnCode,
    noPackages:   sfLine.noPackages,
    quantityKg:   sfLine.quantityKg,
    unit:         "Kgs",
    ratePerKg:    sfLine.ratePerKg,
    amount:       sfLine.amount,
    deliveryDate: sfData.header.deliveryDate,
    routeCode:    sfLine.routeCode,
  }));

  // ── Compute GST ──────────────────────────────────────────────────────────
  const baseAmount = sfData.totals.totalAmount;
  const taxAmount  = Math.round(baseAmount * GST_RATE * 100) / 100;
  const grandTotal = Math.round((baseAmount + taxAmount) * 100) / 100;
  const gstType    = sfData.totals.gstType;

  // ── Validation ───────────────────────────────────────────────────────────
  const warnings = [];

  if (!sfData.billTo.gstin)
    warnings.push("Bill To GSTIN is missing.");
  if (!sfData.shipTo.gstin)
    warnings.push("Ship To GSTIN is missing.");
  if (lineItems.length === 0)
    warnings.push("No line items found — parser may have failed.");

  lineItems.forEach((item) => {
    if (item.quantityKg <= 0)
      warnings.push(`Line ${item.lineNo}: quantity is zero.`);
    if (item.amount <= 0)
      warnings.push(`Line ${item.lineNo}: amount is zero.`);
    if (!item.hsnCode)
      warnings.push(`Line ${item.lineNo}: HSN code missing.`);
  });

  const lineSum = lineItems.reduce((s, i) => s + i.amount, 0);
  if (lineItems.length > 0 && Math.abs(lineSum - baseAmount) > 1)
    warnings.push(`Line item amounts (₹${lineSum.toFixed(2)}) ≠ SF total (₹${baseAmount.toFixed(2)}).`);

  return {
    meta: {
      generatedAt:  new Date().toISOString(),
      sfPONumber:   sfData.header.poNumber,
      internalPONo: sfData.header.internalPONo,
      voucherType:  "Purchase Order",
    },
    header: {
      voucherNo:       sfData.header.internalPONo,
      sfPORef:         sfData.header.poNumber,
      date:            sfData.header.documentDate,
      deliveryDate:    sfData.header.deliveryDate,
      termsOfDelivery: "",
      orderType:       sfData.header.orderType,
      distChannel:     sfData.header.distChannel,
      plantDepot:      sfData.header.plantDepot,
      paymentTerms:    sfData.header.paymentTerms,
      insurance:       sfData.header.insurance,
      transportMode:   sfData.header.transportMode,
      destination:     sfData.header.deliveryTo,
    },
    billTo: {
      ...sfData.billTo,
    },
    shipTo: sfData.shipTo,
    supplier: JK_PAPER_SUPPLIER,
    lineItems,
    totals: {
      totalQtyKg: sfData.totals.totalQtyKg,
      baseAmount,
      gstType,
      gstRatePct,
      taxAmount,
      grandTotal,
    },
    validation: {
      warnings,
      status: warnings.length === 0 ? "CLEAN" : "NEEDS_REVIEW",
    },
  };
}

module.exports = { mergePOData };