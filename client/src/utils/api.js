import axios from "axios";

const api = axios.create({ baseURL: "/api" });

/**
 * Upload Salesforce PO PDF for parsing.
 * @param {File} sfFile  Salesforce PO PDF
 */
export async function uploadPDFs(sfFile) {
  const form = new FormData();
  form.append("sfPO", sfFile);
  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Push merged PO data to TallyPrime.
 * @param {object} poData        Merged PO JSON (possibly edited by user)
 * @param {string} tallyCompany  Optional company name override
 */
export async function pushToTally(poData, tallyCompany) {
  const { data } = await api.post("/tally/push", {
    data: poData,
    ...(tallyCompany ? { tallyCompany } : {}),
  });
  return data;
}

/**
 * Fetch current Tally configuration from the server (.env values).
 */
export async function getTallyConfig() {
  const { data } = await api.get("/tally/config");
  return data;
}

/**
 * Check if TallyPrime is reachable.
 */
export async function checkTallyStatus() {
  const { data } = await api.get("/tally/status");
  return data;
}