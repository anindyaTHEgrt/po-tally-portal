/**
 * sendToTally.js
 * Sends XML payloads to TallyPrime's local HTTP server via axios.
 *
 * FIX: Now correctly detects EXCEPTIONS as a failure condition.
 * Tally uses EXCEPTIONS (not ERRORS or FAILED) for voucher-level failures
 * caused by missing fields, unrecognised structure, or TDL validation errors.
 */

const axios = require("axios");

const TALLY_HOST = "http://localhost";
const TALLY_PORT = process.env.TALLY_PORT || 9000;
const TALLY_URL  = `${TALLY_HOST}:${TALLY_PORT}`;

/**
 * Parses all relevant counts out of a Tally XML response string.
 */
function parseTallyResponse(resText) {
  const int = (tag) =>
      parseInt(resText.match(new RegExp(`<${tag}>(\\d+)<\\/${tag}>`, "i"))?.[1] || "0");

  return {
    created:    int("CREATED"),
    altered:    int("ALTERED"),
    deleted:    int("DELETED"),
    combined:   int("COMBINED"),
    ignored:    int("IGNORED"),
    errors:     int("ERRORS"),
    cancelled:  int("CANCELLED"),
    exceptions: int("EXCEPTIONS"),
    // Legacy fields some Tally versions use
    imported:   int("IMPORTED"),
    failed:     int("FAILED"),
    lineError:  (resText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i)?.[1] || "").trim(),
  };
}

/**
 * Posts raw XML to Tally and returns a structured result.
 * @param {string} xml
 * @returns {Promise<{ success: boolean, counts: object, response: string, error?: string }>}
 */
async function postToTally(xml) {
  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml;charset=utf-8" },
      timeout: 15000,
    });

    const resText = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    const counts = parseTallyResponse(resText);

    // Tally signals voucher-level failures via EXCEPTIONS, not ERRORS/FAILED
    const hasFailed =
        counts.exceptions > 0 ||
        counts.errors     > 0 ||
        counts.failed     > 0 ||
        (counts.lineError && counts.lineError.length > 0);

    if (hasFailed) {
      return {
        success:  false,
        counts,
        response: resText,
        error:    counts.lineError
            || `Tally exception — created=${counts.created}, exceptions=${counts.exceptions}, errors=${counts.errors}`,
      };
    }

    // Success: something was created or altered (or masters already existed → altered)
    return {
      success:  true,
      counts,
      response: resText,
      // Convenience shims so existing callers don't break
      imported: counts.created + counts.altered,
      failed:   0,
    };
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      return {
        success: false,
        error: `Cannot connect to TallyPrime on ${TALLY_URL}. Make sure TallyPrime is running with Gateway Server enabled on port ${TALLY_PORT}.`,
      };
    }
    if (err.code === "ETIMEDOUT") {
      return {
        success: false,
        error: `Connection to TallyPrime timed out. Check Tally is running and port ${TALLY_PORT} is accessible.`,
      };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Checks if TallyPrime is reachable and returns the list of open companies.
 */
async function checkTallyConnection() {
  try {
    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
    const res = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml" },
      timeout: 5000,
    });
    // Extract company names from response for confirmation
    const companies = [...(res.data?.matchAll?.(/<BASICCOMPANYNAME>([^<]+)<\/BASICCOMPANYNAME>/gi) || [])]
        .map((m) => m[1]);
    return {
      reachable: true,
      message: "TallyPrime is connected and responding.",
      companies,
    };
  } catch (err) {
    return {
      reachable: false,
      message: err.code === "ECONNREFUSED"
          ? `TallyPrime not reachable on ${TALLY_URL}. Open TallyPrime and enable Gateway Server.`
          : err.message,
    };
  }
}

module.exports = { postToTally, checkTallyConnection, TALLY_URL };