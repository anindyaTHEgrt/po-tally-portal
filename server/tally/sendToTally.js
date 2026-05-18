/**
 * sendToTally.js
 * Sends XML payloads to TallyPrime's local HTTP server via axios.
 * TallyPrime must be running with Gateway Server enabled on port 9000.
 */

const axios = require("axios");

const TALLY_HOST = "http://localhost";
const TALLY_PORT = 9000;
const TALLY_URL  = `${TALLY_HOST}:${TALLY_PORT}`;

/**
 * Posts raw XML to Tally and returns the response.
 * @param {string} xml
 * @returns {Promise<{ success: boolean, response: string, error?: string }>}
 */
async function postToTally(xml) {
  try {
    const response = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml;charset=utf-8" },
      timeout: 15000,
    });

    const resText = response.data;

    // Tally returns XML — check for error indicators
    const hasError    = /<LINEERROR>(.+?)<\/LINEERROR>/i.test(resText);
    const errorMsg    = resText.match(/<LINEERROR>(.+?)<\/LINEERROR>/i)?.[1] || "";
    const importedCnt = resText.match(/<IMPORTED>(\d+)<\/IMPORTED>/i)?.[1] || "0";
    const failedCnt   = resText.match(/<FAILED>(\d+)<\/FAILED>/i)?.[1] || "0";

    if (hasError || failedCnt !== "0") {
      return {
        success:  false,
        response: resText,
        error:    errorMsg || `Import failed — ${failedCnt} record(s) failed.`,
        imported: parseInt(importedCnt),
        failed:   parseInt(failedCnt),
      };
    }

    return {
      success:  true,
      response: resText,
      imported: parseInt(importedCnt),
      failed:   0,
    };
  } catch (err) {
    // Axios network errors
    if (err.code === "ECONNREFUSED") {
      return {
        success: false,
        error:   `Cannot connect to TallyPrime on ${TALLY_URL}. Make sure TallyPrime is running with Gateway Server enabled on port ${TALLY_PORT}.`,
      };
    }
    if (err.code === "ETIMEDOUT") {
      return {
        success: false,
        error:   `Connection to TallyPrime timed out. Check that Tally is running and port ${TALLY_PORT} is accessible.`,
      };
    }
    return {
      success: false,
      error:   err.message,
    };
  }
}

/**
 * Checks if TallyPrime is reachable.
 * @returns {Promise<{ reachable: boolean, message: string }>}
 */
async function checkTallyConnection() {
  try {
    // Send a minimal status request
    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
    const res = await axios.post(TALLY_URL, xml, {
      headers: { "Content-Type": "text/xml" },
      timeout: 5000,
    });
    return { reachable: true, message: "TallyPrime is connected and responding." };
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
