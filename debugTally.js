/**
 * debugFY.js  —  node debugFY.js
 * Tests voucher with a date in FY 2025-26 (before March 2026).
 * If THIS works but 20260424 doesn't, your Tally period is set to 2025-26.
 */

const axios = require("axios");
const TALLY_URL     = "http://localhost:9000";
const TALLY_COMPANY = "BPM TEST";

async function test(label, date) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY><IMPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>Vouchers</REPORTNAME>
      <STATICVARIABLES><SVCURRENTCOMPANY>${TALLY_COMPANY}</SVCURRENTCOMPANY></STATICVARIABLES>
    </REQUESTDESC>
    <REQUESTDATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER ACTION="Create" OBJVIEW="Voucher View">
          <DATE>${date}</DATE>
          <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
          <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
          <VOUCHERNUMBER>FY-TEST-${Date.now()}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>BHARAT PAPER MART</PARTYLEDGERNAME>
          <PERSISTEDVIEW>Voucher View</PERSISTEDVIEW>
          <ISINVOICE>Yes</ISINVOICE>
          <LEDGERENTRIES.LIST>
            <LEDGERNAME>BHARAT PAPER MART</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>1000.00</AMOUNT>
          </LEDGERENTRIES.LIST>
          <INVENTORYENTRIES.LIST>
            <STOCKITEMNAME>TC - 300 GSM - 84 X 63.5</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <RATE>73.85 Kgs</RATE>
            <AMOUNT>-1000.00</AMOUNT>
            <ACTUALQTY>13.54 Kgs</ACTUALQTY>
            <BILLEDQTY>13.54 Kgs</BILLEDQTY>
            <ACCOUNTINGALLOCATIONS.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>-1000.00</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
          </INVENTORYENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>
    </REQUESTDATA>
  </IMPORTDATA></BODY>
</ENVELOPE>`;

    const res = await axios.post(TALLY_URL, xml, {
        headers: { "Content-Type": "text/xml;charset=utf-8" }, timeout: 8000
    });
    const created = res.data.match(/<CREATED>(\d+)<\/CREATED>/)?.[1];
    const error   = res.data.match(/<LINEERROR>(.+?)<\/LINEERROR>/)?.[1] || "";
    console.log(`${created === "1" ? "✅" : "❌"} ${label} (${date}): ${created === "1" ? "CREATED" : error}`);
}

(async () => {
    await test("FY 2024-25 — Jan 2025",  "20250115");  // definitely in 2024-25
    await test("FY 2025-26 — Jun 2025",  "20250615");  // definitely in 2025-26
    await test("FY 2025-26 — Mar 2026",  "20260315");  // end of 2025-26
    await test("FY 2026-27 — Apr 2026",  "20260424");  // your actual PO date
    await test("FY 2026-27 — May 2026",  "20260518");  // today
    console.log("\nThe ✅ dates tell you which FY is currently open in Tally.");
    console.log("Press Alt+F2 in TallyPrime to change to the period containing 20260424.");
})();