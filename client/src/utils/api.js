import axios from "axios";

const api = axios.create({ baseURL: "/api" });

/**
 * Upload both PDFs for parsing.
 * @param {File} sfFile     Salesforce PO PDF
 * @param {File} emailFile  Vendor email PO PDF
 */
export async function uploadPDFs(sfFile, emailFile) {
  const form = new FormData();
  form.append("sfPO",    sfFile);
  form.append("emailPO", emailFile);
  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Push merged PO data to TallyPrime.
 * @param {object} poData  Merged PO JSON (possibly edited by user)
 */
export async function pushToTally(poData) {
  const { data } = await api.post("/tally/push", { data: poData });
  return data;
}

/**
 * Check if TallyPrime is reachable.
 */
export async function checkTallyStatus() {
  const { data } = await api.get("/tally/status");
  return data;
}
