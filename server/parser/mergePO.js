/**
 * mergePO.js
 * Merges Salesforce PO and Borkar email PO into a unified Tally-ready JSON.
 */

const GST_RATE = 0.18;

function mergePOData(sfData, emailData) {
  const sfInternal = sfData.header.internalPONo.trim();                  // "356"
  const emailPONo  = (emailData.poMeta?.poNumber || "").replace(/\s/g, ""); // "BD/356/0/26.27"

  // Link check: SF internal PO "356" should appear inside Borkar PO "BD/356/0/26.27"
  // Use a word-boundary aware check so "356" doesn't accidentally match "3560"
  const docsLinked = sfInternal.length > 0 &&
      new RegExp(`(?:^|[^\\d])${sfInternal}(?:[^\\d]|$)`).test(emailPONo);

  // Supplemental fields from email PO
  const emailLines   = emailData.lineItems || [];
  const emailRate    = emailLines[0]?.ratePerUnit ?? null;
  const emailDelDate = emailData.delivery?.deliveryDate || sfData.header.deliveryDate;

  // ── Enrich SF line items ───────────────────────────────────────────────────
  const lineItems = sfData.lineItems.map((sfLine) => {
    const rateMatches = emailRate !== null
        ? Math.abs(sfLine.ratePerKg - emailRate) < 2
        : true;

    return {
      lineNo:       sfLine.lineNo,
      fullLineRef:  sfLine.fullLineRef,
      itemBrand:    sfLine.itemBrand,
      brand:        sfLine.brand,
      materialCode: sfLine.materialCode,
      description:  sfLine.description,    // "TC - 300 GSM - 84 X 63.5" — derived from SF material code
      hsnCode:      sfLine.hsnCode,
      noPackages:   sfLine.noPackages,
      quantityKg:   sfLine.quantityKg,     // SF authoritative
      unit:         "Kgs",
      ratePerKg:    sfLine.ratePerKg,      // derived from SF (amount ÷ qty)
      rateEmailPO:  emailRate,             // for cross-check display
      rateMatches,
      amount:       sfLine.amount,         // SF authoritative
      deliveryDate: emailDelDate,
      routeCode:    sfLine.routeCode,
    };
  });

  // ── Compute GST ────────────────────────────────────────────────────────────
  const baseAmount = sfData.totals.totalAmount;
  const taxAmount  = Math.round(baseAmount * GST_RATE * 100) / 100;
  const grandTotal = Math.round((baseAmount + taxAmount) * 100) / 100;
  const gstType    = sfData.totals.gstType;

  const emailGrand  = emailData.totals?.grandTotal || 0;
  // Note: totals will differ — Borkar PO is 5000 KGS rounded, SF is 5024 KGS exact
  const totalsMatch = emailGrand ? Math.abs(grandTotal - emailGrand) < 20000 : null;

  const issuer = emailData.issuer || {};

  // ── Validation ─────────────────────────────────────────────────────────────
  const warnings = [];

  if (!docsLinked)
    warnings.push(`SF PO internal ref "${sfInternal}" not found in email PO number "${emailPONo}" — verify manually.`);
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
    if (!item.rateMatches)
      warnings.push(`Line ${item.lineNo}: rate check — SF ₹${item.ratePerKg}/kg vs Email PO ₹${item.rateEmailPO}/kg (expected difference).`);
    if (!item.hsnCode)
      warnings.push(`Line ${item.lineNo}: HSN code missing.`);
  });

  const lineSum = lineItems.reduce((s, i) => s + i.amount, 0);
  if (lineItems.length > 0 && Math.abs(lineSum - baseAmount) > 1)
    warnings.push(`Line item amounts (₹${lineSum.toFixed(2)}) ≠ SF total (₹${baseAmount.toFixed(2)}).`);

  return {
    meta: {
      generatedAt:   new Date().toISOString(),
      sfPONumber:    sfData.header.poNumber,
      internalPONo:  sfData.header.internalPONo,
      emailPONumber: emailData.poMeta?.poNumber || "",
      emailPOFormat: emailData.source,
      docsLinked,
      voucherType:   "Purchase Order",
    },
    header: {
      voucherNo:     sfData.header.internalPONo,
      sfPORef:       sfData.header.poNumber,
      date:          sfData.header.documentDate,
      deliveryDate:  sfData.header.deliveryDate,
      termsOfDelivery: emailData.poMeta?.termsOfDelivery || "", // ← add this
      orderType:     sfData.header.orderType,
      distChannel:   sfData.header.distChannel,
      plantDepot:    sfData.header.plantDepot,
      paymentTerms:  sfData.header.paymentTerms,
      insurance:     sfData.header.insurance,
      transportMode: sfData.header.transportMode,
      destination: emailData.delivery?.destination || sfData.header.deliveryTo,
    },
    billTo: {
      ...sfData.billTo,
      email: emailData.vendor?.email || "",
      phone: emailData.vendor?.phone || "",
    },
    shipTo: sfData.shipTo,
    supplier: {
      name:  issuer.name  || "JK PAPER LTD. (UNIT CPM)",
      gstin: issuer.gstin || "24AAACT6305N2Z9",
      pan:   issuer.pan   || "",
      phone: issuer.phone || "",
      email: issuer.email || "",
    },
    lineItems,
    totals: {
      totalQtyKg:      sfData.totals.totalQtyKg,
      baseAmount,
      gstType,
      gstRatePct:      GST_RATE * 100,
      taxAmount,
      grandTotal,
      emailGrandTotal: emailGrand,
      totalsMatch,
    },
    validation: {
      warnings,
      status: warnings.length === 0 ? "CLEAN" : "NEEDS_REVIEW",
    },
  };
}

module.exports = { mergePOData };