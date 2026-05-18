/**
 * detectFormat.js
 * Detects whether an email PO PDF is from Borkar Packaging or Parksons Packaging.
 *
 * Detection signals (in priority order):
 *   1. Company name in header text
 *   2. GSTIN state prefix (30 = Goa = Borkar, 26 = Daman = Parksons)
 *   3. PO number format  (BD/XXX = Borkar)
 *   4. Address keywords
 */

/**
 * @param {string} text  Full extracted text from the email PO PDF
 * @returns {"BORKAR" | "PARKSONS" | "UNKNOWN"}
 */
function detectEmailPOFormat(text) {
  const upper = text.toUpperCase();

  // Signal 1 — Company name (most reliable)
  if (upper.includes("BORKAR PACKAGING")) return "BORKAR";
  if (upper.includes("PARKSONS PACKAGING")) return "PARKSONS";

  // Signal 2 — GSTIN state prefix
  if (/GSTIN[^:]*:\s*30[A-Z0-9]{13}/i.test(text)) return "BORKAR";
  if (/GSTIN[^:]*:\s*26[A-Z0-9]{13}/i.test(text)) return "PARKSONS";

  // Signal 3 — PO number format
  if (/BD\/\d+/i.test(text)) return "BORKAR";

  // Signal 4 — Address keywords
  if (/MARGAO|CURTORIM|GOA\s*[-–]\s*403/i.test(text)) return "BORKAR";
  if (/RINGANWADA|NANI\s*DAMAN|SURVEY\s*NO/i.test(text)) return "PARKSONS";

  return "UNKNOWN";
}

module.exports = { detectEmailPOFormat };
