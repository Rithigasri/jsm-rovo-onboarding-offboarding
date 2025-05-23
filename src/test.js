import fs from "fs/promises";

// --- Authorization and workspace details from index.js ---
const EMAIL = "rithigasri.b@cprime.com";
const API_TOKEN = "****";
const WORKSPACE_ID = "9639f74b-a7d7-4189-9acb-9a493cbfe46f";
const JIRA_URL = "https://one-atlas-onki.atlassian.net/rest/api/3/issue/HR-63";
const ASSET_BASE_URL = `https://api.atlassian.com/jsm/assets/workspace/${WORKSPACE_ID}/v1/object`;

// --- Helper to create HTTP headers ---
function getHeaders() {
  const authHeader = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");
  return {
    "Authorization": `Basic ${authHeader}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

// Helper to fetch asset label by objectId
async function fetchAssetLabel(objectId) {
  if (!objectId) return null;
  const url = `${ASSET_BASE_URL}/${objectId}`;
  try {
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) return null;
    const data = await response.json();
    return data.label || null;
  } catch {
    return null;
  }
}

// --- Main function ---
async function fetchAndMapIssue() {
  try {
    const response = await fetch(JIRA_URL, {
      method: "GET",
      headers: getHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to fetch issue:", response.status, await response.text());
      return;
    }

    const data = await response.json();
    const fields = data.fields;

    // Asset custom fields: get objectId from first element if present
    const assetFields = [
      { key: "customfield_10089", name: "region" },
      { key: "customfield_10090", name: "office" },
      { key: "customfield_10133", name: "employee_type" },
      { key: "customfield_10131", name: "employee_department" },
      { key: "customfield_10129", name: "employee_role" },
      { key: "customfield_10134", name: "employee_manager" },
    ];

    const assetLabels = {};
    for (const { key, name } of assetFields) {
      const arr = fields[key];
      let objectId = null;
      if (Array.isArray(arr) && arr.length > 0 && arr[0].objectId) {
        objectId = arr[0].objectId;
      }
      assetLabels[name] = await fetchAssetLabel(objectId);
    }

    // Map required custom fields
    const mapped = {
      email_id: fields.customfield_10404 || null,
      employee_start_date: fields.customfield_10054 || null,
      job_title: fields.customfield_10057 || null,
      employee_equipment_needed: fields.customfield_10130?.value || null,
      ...assetLabels,
    };

    // Save to response.json
    await fs.writeFile("response.json", JSON.stringify(mapped, null, 2), "utf8");
    console.log("Response saved to response.json:", mapped);
  } catch (error) {
    console.error("Error:", error);
  }
}

fetchAndMapIssue();