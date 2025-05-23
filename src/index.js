import api, { route } from "@forge/api";
import fs from "fs/promises";
import path from "path";

const EMAIL = "rithigasri.b@cprime.com";
const API_TOKEN = "*****";
const WORKSPACE_ID = "9639f74b-a7d7-4189-9acb-9a493cbfe46f";
 // ✅ Replace with your actual spaceId (not key)

const BASE_URL = `https://api.atlassian.com/jsm/assets/workspace/${WORKSPACE_ID}/v1`;
const CONFLUENCE_BASE_URL = "https://one-atlas-onki.atlassian.net/wiki/rest/api";


const EMP_DATA_FILE = path.join(__dirname, "emp_data.json");
const OBJECT_TYPE_ID = 166; // ObjectType ID for "People"
const OBJECT_SCHEMA_ID = 14; // ObjectSchema ID

function getHeaders() {
  const authHeader = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");
  return {
    "Authorization": `Basic ${authHeader}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

// Debugging helper function
function logDebugInfo(message, data) {
  console.log(`DEBUG: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Helper function to write employee data to the JSON file


// Helper function to read employee data from the JSON file
async function readEmployeeData() {
  try {
    const data = await fs.readFile(EMP_DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading employee data:", error);
    return [];
  }
}

// Function to check if an employee exists using AQL
const checkEmployeeExists = async (userId) => {
  const url = `${BASE_URL}/object/aql?startAt=0&maxResults=1&includeAttributes=true`;
  const payload = {
    qlQuery: `objectType = "People" AND Employee_id = "${userId}"`, // Correct AQL query
  };

  try {
    console.log(`🔍 Checking if employee with ID ${userId} exists using AQL...`);
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("AQL Response:", JSON.stringify(data, null, 2));

      // Check if the total field indicates the employee exists
      const exists = data.total === 1;
      console.log(`✅ Employee with ID ${userId} ${exists ? "exists" : "does not exist"}.`);
      return exists;
    } else {
      console.error("❌ Failed to check employee existence:", response.status, await response.text());
      return false;
    }
  } catch (error) {
    console.error("❌ Error while checking employee existence:", error);
    return false;
  }
};

// Updated addEmployee function
export async function addEmployee(payload) {
  console.log("Payload received:", payload);

  const { userId, username, email, phoneNumber, department } = payload;

  // Validate all required fields
  if (!userId || !username || !email || !phoneNumber || !department) {
    console.error("❌ Invalid payload. Ensure userId, username, email, phoneNumber, and department are provided.");
    return {
      status: "error",
      message: "Invalid payload. Ensure userId, username, email, phoneNumber, and department are provided.",
    };
  }

  // Check if the employee already exists using AQL
  const employeeExists = await checkEmployeeExists(userId);

  if (employeeExists) {
    console.log(`❌ Employee already exists: ${username} (ID: ${userId}).`);
    return {
      status: "error",
      message: `Employee already exists: ${username} (ID: ${userId}).`,
    };
  }

  console.log(`Adding new employee: ${userId}, ${username}, ${email}, ${phoneNumber}, ${department}`);
  const data = {
    objectTypeId: "166",
    attributes: [
      {
        objectTypeAttributeId: "1552", // Attribute ID for username
        objectAttributeValues: [{ value: username }],
      },
      {
        objectTypeAttributeId: "1561", // Attribute ID for userId
        objectAttributeValues: [{ value: userId }],
      },
      {
        objectTypeAttributeId: "1573", // Attribute ID for email
        objectAttributeValues: [{ value: email }],
      },
      {
        objectTypeAttributeId: "1574", // Attribute ID for phoneNumber
        objectAttributeValues: [{ value: phoneNumber }],
      },
      {
        objectTypeAttributeId: "1575", // Attribute ID for department
        objectAttributeValues: [{ value: department }],
      },
    ],
  };

  try {
    console.log("🔄 Sending request to create object...");
    const response = await fetch(`${BASE_URL}/object/create`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Employee added successfully:", result);

      return {
        status: "success",
        message: "Employee added successfully.",
      };
    } else {
      console.error("❌ Failed to add employee:", response.status, await response.text());
      return {
        status: "error",
        message: "Failed to add employee.",
      };
    }
  } catch (error) {
    console.error("❌ Error while adding employee:", error);
    return {
      status: "error",
      message: "An error occurred while adding the employee.",
    };
  }
}

// 2. Confluence Sync

export async function syncToConfluence() {
  const objectSchemaId = 14; // Restrict to Object Schema ID 14
  const confluencePageId = "27394050"; // ID of the existing Confluence page to update
  console.log("🔄 Starting sync to Confluence for object schema:", objectSchemaId);

  const getAllObjectTypes = async () => {
    const url = `${BASE_URL}/objectschema/${objectSchemaId}/objecttypes`;
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      console.error("❌ Failed to fetch object types:", response.status);
      return [];
    }
    const types = await response.json();
    console.log("✅ Fetched object types for schema ID 14:", types);
    return types.map((type) => ({ id: type.id, name: type.name }));
  };

  const getObjectDetails = async (objectId) => {
    const url = `${BASE_URL}/object/${objectId}?includeExtendedInfo=false`;

    try {
      console.log(`🔍 Fetching details for object ID: ${objectId}`);
      const response = await fetch(url, { headers: getHeaders() });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Fetched details for object ID ${objectId}:`, data);

        // Map attributes to a key-value pair
        const attributes = {};
        data.attributes.forEach((attr) => {
          const name = attr.objectTypeAttribute.name;
          const value = attr.objectAttributeValues?.[0];

          if (value) {
            if (value.referencedObject) {
              // If the attribute is a referenced object, use its displayValue or name
              attributes[name] = value.referencedObject.displayValue || value.referencedObject.name;
            } else {
              // Otherwise, use the raw value
              attributes[name] = value.displayValue || value.value;
            }
          } else {
            // Explicitly set the value to an empty string if no value is present
            attributes[name] = "";
          }
        });

        return { id: data.id, name: data.name, attributes };
      } else {
        console.error(`❌ Failed to fetch details for object ID ${objectId}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error while fetching details for object ID ${objectId}:`, error);
      return null;
    }
  };

  const getObjects = async (objectTypeId, objectTypeName) => {
    const url = `${BASE_URL}/object/aql?startAt=0&maxResults=100&includeAttributes=true`;
    const payload = {
      qlQuery: `objectSchemaId = 14 AND objectType = "${objectTypeName}"`, // Restrict to Object Schema ID 14
    };

    try {
      console.log(`🔍 Fetching objects for object type: ${objectTypeName} in schema ID 14...`);
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`❌ Failed to fetch objects for ${objectTypeName}:`, response.status);
        return [];
      }

      const data = await response.json();
      console.log(`✅ Fetched objects for ${objectTypeName}:`, data);
      const objects = data.values || [];

      // Fetch detailed attributes for each object using for...of to properly await each call
      const detailedObjects = [];
      for (const obj of objects) {
        const detailedObject = await getObjectDetails(obj.id);
        if (detailedObject) {
          detailedObjects.push(detailedObject);
        }
      }

      return detailedObjects;
    } catch (error) {
      console.error("❌ Error while fetching objects:", error);
      return [];
    }
  };

  const updateConfluencePage = async (pageId, title, content, versionNumber) => {
    const url = `${CONFLUENCE_BASE_URL}/content/${pageId}`;
    const payload = {
      id: pageId,
      type: "page",
      title: title,
      body: {
        storage: {
          value: `<p>${content}</p>`,
          representation: "storage",
        },
      },
      version: {
        number: versionNumber + 1,
        message: "Updated with the latest asset data",
      },
    };

    try {
      console.log("🔄 Updating Confluence page with payload:", payload);
      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Confluence page updated successfully:", result._links.base + result._links.webui);
      } else {
        console.error("❌ Failed to update Confluence page:", response.status, await response.text());
      }
    } catch (error) {
      console.error("❌ Error while updating Confluence page:", error);
    }
  };

  const getConfluencePageVersion = async (pageId) => {
    const url = `${CONFLUENCE_BASE_URL}/content/${pageId}?expand=version`;
    try {
      const response = await fetch(url, { headers: getHeaders() });
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Fetched Confluence page version:", data.version.number);
        return data.version.number;
      } else {
        console.error("❌ Failed to fetch Confluence page version:", response.status, await response.text());
        return null;
      }
    } catch (error) {
      console.error("❌ Error while fetching Confluence page version:", error);
      return null;
    }
  };

  try {
    const objectTypes = await getAllObjectTypes();
    if (objectTypes.length === 0) {
      console.error("❌ No object types found for schema ID 14. Exiting sync process.");
      return;
    }

    const allObjects = [];
    for (const objectType of objectTypes) {
      console.log("🔍 Processing object type:", objectType.name);
      const objects = await getObjects(objectType.id, objectType.name);
      if (objects.length === 0) {
        console.warn(`⚠️ No objects found for object type ${objectType.name}. Skipping.`);
        continue;
      }

      console.log(`✅ Processed objects for ${objectType.name}:`, objects);
      allObjects.push({ objectType: objectType.name, objects });
    }

    if (allObjects.length === 0) {
      console.error("❌ No objects processed for schema ID 14. Exiting sync process.");
      return;
    }

    const jsonContent = JSON.stringify(allObjects, null, 2);
    console.log("📄 Generated JSON content for Confluence page:", jsonContent);

    const title = "Asset Knowledge Base";
    const versionNumber = await getConfluencePageVersion(confluencePageId);
    if (versionNumber !== null) {
      await updateConfluencePage(confluencePageId, title, jsonContent, versionNumber);
    }
  } catch (error) {
    console.error("❌ Error in syncToConfluence:", error);
  }
}

export async function assignAsset(payload) {
  console.log("Payload received for assignAsset:", payload);

  const { assetId, employeeId } = payload;

  if (!assetId || !employeeId) {
    console.error("❌ Missing required fields in payload. Ensure both assetId and employeeId are provided.");
    return {
      status: "error",
      message: "Missing required fields. Ensure both assetId and employeeId are provided.",
    };
  }

  console.log(`Processing asset assignment: Asset ID - ${assetId}, Employee ID - ${employeeId}`);

  // Function to fetch the objectKey for an asset using its assetId
  const getAssetObjectKey = async (assetId) => {
    const url = `${BASE_URL}/object/aql?startAt=0&maxResults=1&includeAttributes=true`;
    const payload = {
      qlQuery: `objectType = "Asset" AND Asset_id = "${assetId}"`, // Correct AQL query
    };

    try {
      console.log(`🔍 Fetching asset objectKey for Asset ID: ${assetId} using AQL...`);
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.total === 1) {
          const objectKey = data.values[0]?.objectKey;
          console.log(`✅ Asset found. ObjectKey: ${objectKey}`);
          return objectKey;
        } else {
          console.log(`❌ Asset with ID ${assetId} not found.`);
          return null;
        }
      } else {
        console.error("❌ Failed to fetch asset objectKey:", response.status, await response.text());
        return null;
      }
    } catch (error) {
      console.error("❌ Error while fetching asset objectKey:", error);
      return null;
    }
  };

  // Function to fetch the objectKey for an employee using their employeeId
  const getEmployeeObjectKey = async (employeeId) => {
    const url = `${BASE_URL}/object/aql?startAt=0&maxResults=1&includeAttributes=true`;
    const payload = {
      qlQuery: `objectType = "People" AND Employee_id = "${employeeId}"`, // Correct AQL query
    };

    try {
      console.log(`🔍 Fetching employee objectKey for Employee ID: ${employeeId} using AQL...`);
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.total === 1) {
          const objectKey = data.values[0]?.objectKey;
          console.log(`✅ Employee found. ObjectKey: ${objectKey}`);
          return objectKey;
        } else {
          console.log(`❌ Employee with ID ${employeeId} not found.`);
          return null;
        }
      } else {
        console.error("❌ Failed to fetch employee objectKey:", response.status, await response.text());
        return null;
      }
    } catch (error) {
      console.error("❌ Error while fetching employee objectKey:", error);
      return null;
    }
  };

  // Function to update the "Owner" attribute with the employee's objectKey
  const updateOwner = async (assetObjectKey, employeeObjectKey) => {
    const objectId = assetObjectKey.split("-")[1];
    const url = `${BASE_URL}/object/${objectId}`;
    const payloadData = {
      attributes: [
        {
          objectTypeAttributeId: "1572", // Attribute ID for "Owner"
          objectAttributeValues: [
            {
              value: employeeObjectKey, // Employee objectKey to assign
            },
          ],
        },
      ],
    };

    try {
      console.log(`Updating asset ${assetObjectKey} with owner objectKey ${employeeObjectKey}...`);
      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payloadData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Update successful:", result);
        return {
          status: "success",
          message: `Asset successfully assigned to Owner: ${employeeObjectKey}`,
        };
      } else {
        console.error("❌ Update failed:", response.status, await response.text());
        return {
          status: "error",
          message: "Failed to assign asset.",
        };
      }
    } catch (error) {
      console.error("❌ Error during update:", error);
      return {
        status: "error",
        message: "An error occurred while assigning the asset.",
      };
    }
  };

  // Fetch the objectKey for the asset using its assetId
  const assetObjectKey = await getAssetObjectKey(assetId);
  if (!assetObjectKey) {
    return {
      status: "error",
      message: `Asset with ID ${assetId} does not exist. Please add the asset to the system before assigning it.`,
    };
  }

  // Fetch the objectKey for the employee using their employeeId
  const employeeObjectKey = await getEmployeeObjectKey(employeeId);
  if (!employeeObjectKey) {
    return {
      status: "error",
      message: `Employee with ID ${employeeId} does not exist. Please add the employee to the system before assigning the asset.`,
    };
  }

  // Update the "Owner" attribute to assign the asset to the employee
  const result = await updateOwner(assetObjectKey, employeeObjectKey);
  return result;
}

export async function deallocateAsset(payload) {
  console.log("Payload received for deallocateAsset:", payload);

  if (payload.objectKey) {
    const objectKey = payload.objectKey;

    console.log(`Processing asset deallocation: Object Key - ${objectKey}`);

    // Function to fetch the current value of the "Owner" attribute
    const fetchOwnerAttribute = async (objectKey) => {
      const objectId = objectKey.split("-")[1];
      const url = `${BASE_URL}/object/${objectId}/attributes`;

      try {
        console.log(`Fetching attributes for object ${objectKey} (ID: ${objectId})...`);
        const response = await fetch(url, {
          method: "GET",
          headers: getHeaders(),
        });

        if (response.ok) {
          const attributes = await response.json();

          // Locate the "Owner" attribute by its attribute id (1572)
          const ownerAttribute = attributes.find(
            (attr) => attr.objectTypeAttributeId === "1572"
          );

          // Check if the attribute exists and has a referencedObject
          if (
            ownerAttribute &&
            ownerAttribute.objectAttributeValues.length > 0 &&
            ownerAttribute.objectAttributeValues[0].referencedObject
          ) {
            const label = ownerAttribute.objectAttributeValues[0].referencedObject.label;
            console.log(`Fetched "Owner" attribute label: ${label}`);
            return label;
          }

          console.log(`"Owner" attribute is empty or not set.`);
          return null; // Return null if the attribute is empty or not set
        } else {
          console.error("❌ Failed to fetch attributes:", response.status, await response.text());
          return null;
        }
      } catch (error) {
        console.error("❌ Error while fetching attributes:", error);
        return null;
      }
    };

    // Function to update the "Owner" attribute to remove its value
    const removeOwner = async (objectKey) => {
      const objectId = objectKey.split("-")[1];
      const url = `${BASE_URL}/object/${objectId}`;
      const payloadData = {
        attributes: [
          {
            objectTypeAttributeId: "1572", // Attribute ID for "Owner"
            objectAttributeValues: [], // Set to an empty array to remove the value
          },
        ],
      };

      try {
        console.log(`Removing owner for object ${objectKey}...`);
        const response = await fetch(url, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify(payloadData),
        });

        if (response.ok) {
          const result = await response.json();
          console.log("✅ Owner removed successfully:", result);
          return {
            status: "success",
            message: `Owner removed successfully for asset: ${objectKey}`,
          };
        } else {
          console.error("❌ Failed to remove owner:", response.status, await response.text());
          return {
            status: "error",
            message: "Failed to remove owner.",
          };
        }
      } catch (error) {
        console.error("❌ Error during owner removal:", error);
        return {
          status: "error",
          message: "An error occurred while removing the owner.",
        };
      }
    };

    // Fetch the current "Owner" attribute value
    const currentValue = await fetchOwnerAttribute(objectKey);

    // Debug logging of the fetched value.
    console.log(`Debug: Fetched "Owner" attribute value: ${currentValue}`);

    // Check if the attribute has a value
    if (currentValue) {
      console.log(`"Owner" is currently set to: ${currentValue}. Proceeding with removal...`);
      const result = await removeOwner(objectKey);
      return result;
    } else {
      console.log(`❌ Asset already has no owner. No update performed.`);
      return {
        status: "error",
        message: `Asset already has no owner.`,
      };
    }
  } else {
    console.error("❌ Missing required fields in payload. Ensure objectKey is provided.");
    return {
      status: "error",
      message: "Missing required fields. Ensure objectKey is provided.",
    };
  }
}

export async function deleteEmployee(payload) {
  console.log("Received payload for deleteEmployee:", JSON.stringify(payload, null, 2));

  // Extract the emp_id from the payload
  const empId = payload?.emp_id;

  // Validate the emp_id parameter
  if (typeof empId !== "string" || empId.trim() === "") {
    console.error("❌ Invalid emp_id parameter. emp_id must be a non-empty string.");
    return {
      status: "error",
      message: "Invalid emp_id. Please provide a valid employee ID.",
    };
  }

  // Check if the employee exists using AQL
  const employeeExists = await checkEmployeeExists(empId);

  if (!employeeExists) {
    console.error(`❌ Employee with ID ${empId} not found.`);
    return {
      status: "error",
      message: `Employee with ID ${empId} not found.`,
    };
  }

  try {
    // Fetch the objectKey using AQL
    const url = `${BASE_URL}/object/aql?startAt=0&maxResults=1&includeAttributes=true`;
    const payload = {
      qlQuery: `objectType = "People" AND Employee_id = "${empId}"`,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("❌ Failed to fetch employee objectKey:", response.status, await response.text());
      return {
        status: "error",
        message: "Failed to fetch employee objectKey.",
      };
    }

    const data = await response.json();
    const objectKey = data.values[0]?.objectKey;
    const objectId = objectKey.split("-")[1]; // Extract the numeric ID from the objectKey
    console.log(`✅ Found employee. ObjectKey: ${objectKey}, ObjectId: ${objectId}`);

    // Delete the object using the API
    const deleteUrl = `${BASE_URL}/object/${objectId}`;
    console.log(`🔄 Sending DELETE request to URL: ${deleteUrl}...`);

    const deleteResponse = await fetch(deleteUrl, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (deleteResponse.ok) {
      console.log(`✅ Successfully deleted object with ID ${objectId}.`);
      return {
        status: "success",
        message: `Employee with ID ${empId} and objectKey ${objectKey} successfully deleted.`,
      };
    } else {
      console.error("❌ Failed to delete object:", deleteResponse.status, await deleteResponse.text());
      return {
        status: "error",
        message: "Failed to delete the employee object.",
      };
    }
  } catch (error) {
    console.error("❌ Error while deleting employee:", error);
    return {
      status: "error",
      message: "An error occurred while deleting the employee.",
    };
  }
}

// Function to query the knowledge base
export async function queryKnowledgeBase(payload) {
  console.log("Received payload for queryKnowledgeBase:", JSON.stringify(payload, null, 2));

  const query = payload?.query;

  if (typeof query !== "string" || query.trim() === "") {
    console.error("❌ Invalid query parameter. Query must be a non-empty string.");
    return {
      status: "error",
      message: "Invalid query. Please provide a valid question or search term.",
    };
  }

  const confluencePageId = "27394050"; // ID of the Confluence page
  const url = `${CONFLUENCE_BASE_URL}/content/${confluencePageId}?expand=body.storage`;

  try {
    console.log("🔄 Fetching content from the Confluence knowledge base...");
    const response = await fetch(url, {
      method: "GET",
      headers: getHeaders(),
    });

    if (!response.ok) {
      console.error("❌ Failed to fetch knowledge base content:", response.status, await response.text());
      return {
        status: "error",
        message: "Failed to fetch knowledge base content.",
      };
    }

    const data = await response.json();
    const rawContent = data.body.storage.value; // HTML content of the page
    console.log("✅ Successfully fetched knowledge base content.");
    console.log("📄 Confluence Content (Raw):", rawContent);

    // Decode HTML entities (e.g., &quot; -> ")
    const decodeHtmlEntities = (str) => {
      return str
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    };

    const decodedContent = decodeHtmlEntities(rawContent.replace(/<\/?p>/g, "").trim());
    console.log("📄 Confluence Content (Decoded):", decodedContent);

    // Prepare the payload for the Gemini API with a refined prompt
    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              text: `You are an intelligent assistant with access to a knowledge base. Use the provided knowledge base content to answer the user's question accurately. If the answer cannot be found in the knowledge base, respond with "The requested information is not available in the knowledge base."

Knowledge Base Content:
${decodedContent}

Question: ${query}`,
            },
          ],
        },
      ],
    };

    console.log("📄 Question passed to Gemini API:", query);
    console.log("📄 Payload sent to Gemini API:", JSON.stringify(geminiPayload, null, 2));

    // Call the Gemini API
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyB8XhOb7B67nb7N7gj4eMgiQikkqGC7WrE",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      }
    );

    if (!geminiResponse.ok) {
      console.error(
        "❌ Failed to get response from Gemini API:",
        geminiResponse.status,
        await geminiResponse.text()
      );
      return {
        status: "error",
        message: "Failed to get a response from the Gemini API.",
      };
    }

    const geminiData = await geminiResponse.json();
    const geminiAnswer =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";

    console.log("✅ Successfully received response from Gemini API:", geminiAnswer);

    return {
      status: "success",
      answer: geminiAnswer,
    };
  } catch (error) {
    console.error("❌ Error in queryKnowledgeBase:", error);
    return {
      status: "error",
      message: "An error occurred while querying the knowledge base.",
    };
  }
}
