/**
 * utils.js
 * Shared utilities for all PO parsers.
 */

// ── Regex helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the first capture group of a regex match, or "".
 * @param {string} text
 * @param {RegExp} pattern  Must have at least one capture group
 * @returns {string}
 */
function find(text, pattern) {
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

/**
 * Returns all matches of a capture group.
 * @param {string} text
 * @param {RegExp} pattern  Must be a global regex with one capture group
 * @returns {string[]}
 */
function findAll(text, pattern) {
  return [...text.matchAll(pattern)].map((m) => m[1].trim());
}

// ── Number cleaners ───────────────────────────────────────────────────────────

/**
 * Converts Indian-format amount string to float.
 * "3,00,000.00" → 300000.0
 * @param {string} s
 * @returns {number}
 */
function cleanAmount(s) {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, "")) || 0;
}

/**
 * Converts quantity string to float.
 * "5,024.00" → 5024.0
 * @param {string} s
 * @returns {number}
 */
function cleanQty(s) {
  if (!s) return 0;
  return parseFloat(s.replace(/[^\d.]/g, "")) || 0;
}

// ── GST / State helpers ───────────────────────────────────────────────────────

const STATE_MAP = {
  "01": "Jammu & Kashmir",    "02": "Himachal Pradesh",
  "03": "Punjab",             "04": "Chandigarh",
  "05": "Uttarakhand",        "06": "Haryana",
  "07": "Delhi",              "08": "Rajasthan",
  "09": "Uttar Pradesh",      "10": "Bihar",
  "11": "Sikkim",             "12": "Arunachal Pradesh",
  "13": "Nagaland",           "14": "Manipur",
  "15": "Mizoram",            "16": "Tripura",
  "17": "Meghalaya",          "18": "Assam",
  "19": "West Bengal",        "20": "Jharkhand",
  "21": "Odisha",             "22": "Chhattisgarh",
  "23": "Madhya Pradesh",     "24": "Gujarat",
  "25": "Daman & Diu",        "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",        "28": "Andhra Pradesh",
  "29": "Karnataka",          "30": "Goa",
  "31": "Lakshadweep",        "32": "Kerala",
  "33": "Tamil Nadu",         "34": "Puducherry",
  "35": "Andaman & Nicobar",  "36": "Telangana",
  "37": "Andhra Pradesh (New)",
};

/**
 * Derives state name and code from GSTIN prefix.
 * @param {string} gstin
 * @returns {{ stateName: string, stateCode: string }}
 */
function deriveStateFromGSTIN(gstin) {
  const code = gstin ? gstin.slice(0, 2) : "";
  return {
    stateName: STATE_MAP[code] || "Unknown",
    stateCode: code,
  };
}

/**
 * Determines GST type based on Bill To and Ship To state codes.
 * Different states → IGST. Same state → CGST+SGST.
 * @param {string} billToGSTIN
 * @param {string} shipToGSTIN
 * @returns {"IGST" | "CGST+SGST"}
 */
function determineGSTType(billToGSTIN, shipToGSTIN) {
  if (!billToGSTIN || !shipToGSTIN) return "IGST"; // default to IGST if unknown
  return billToGSTIN.slice(0, 2) !== shipToGSTIN.slice(0, 2) ? "IGST" : "CGST+SGST";
}

// ── Date formatter ────────────────────────────────────────────────────────────

/**
 * Formats a date string to Tally's required YYYYMMDD format.
 * Accepts: "2026-04-24", "24/04/2026", "24-Apr-26"
 * @param {string} dateStr
 * @returns {string}  e.g. "20260424"
 */
function formatDateForTally(dateStr) {
  if (!dateStr) return "";

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr.replace(/-/g, "");
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("/");
    return `${y}${m}${d}`;
  }

  // ADD THIS: DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("-");
    return `${y}${m}${d}`;
  }

  // DD-MMM-YY (e.g. 24-Apr-26)
  const months = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  const m2 = dateStr.match(/(\d{2})-([A-Za-z]{3})-(\d{2,4})/);
  if (m2) {
    const year = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${year}${months[m2[2].toLowerCase()] || "01"}${m2[1]}`;
  }

  return dateStr.replace(/\D/g, "");
}

module.exports = {
  find,
  findAll,
  cleanAmount,
  cleanQty,
  deriveStateFromGSTIN,
  determineGSTType,
  formatDateForTally,
};
