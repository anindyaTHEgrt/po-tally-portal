import axios from "axios";
const URL = "http://localhost:9000";
import fs from "fs";

async function post(label, xml) {
    const r = await axios.post(URL, xml, {
        headers: { "Content-Type": "text/xml;charset=utf-8" },
        timeout: 8000
    });
    console.log(`\n── ${label} ──`);
    console.log(r.data);  // ← print raw response instead of parsed counts
    fs.writeFileSync("ledgers.xml", r.data);
    console.log(`── ${label} — written to ledgers.xml`);
}

await post("Export Ledgers", `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>List of Accounts</REPORTNAME>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>BPM TEST</SVCURRENTCOMPANY>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <ACCOUNTTYPE>Ledger</ACCOUNTTYPE>
      </STATICVARIABLES>
    </REQUESTDESC>
  </EXPORTDATA></BODY>
</ENVELOPE>`);