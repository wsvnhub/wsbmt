import axios from "axios";
import { config } from "dotenv";
import { errorLogger, larkLogger } from "./logger.js";

config();

// Constants
const LARK_API_URL = "https://open.larksuite.com/open-apis";

// Load environment variables
const { APP_ID, APP_SECRET, APP_TOKEN, TABLE_ID } = process.env;

if (!APP_ID || !APP_SECRET || !APP_TOKEN || !TABLE_ID) {
    errorLogger.error("Missing required environment variables in Lark.")
    throw new Error("Missing required environment variables.");
}

// Shared headers
const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
};

// Get Lark Tenant Access Token
const getLarkAccessToken = async () => {
    try {
        const { data, status } = await axios.post(
            `${LARK_API_URL}/auth/v3/tenant_access_token/internal`,
            {
                app_id: APP_ID,
                app_secret: APP_SECRET,
            },
            { headers: JSON_HEADERS }
        );

        if (status !== 200 || !data?.tenant_access_token) {
            throw new Error(`Lark token fetch failed: ${JSON.stringify(data)}`);
        }

        return data.tenant_access_token;
    } catch (err) {
        errorLogger.error(`Error getting Lark access token: ${JSON.stringify(err)}`)
        console.error("Error getting Lark access token:", err);
        throw err;
    }
};

// Helper to create auth headers
const buildAuthHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
});

// Create a new Lark record
export const createLarkRecord = async (newRecord) => {
    try {
        const token = await getLarkAccessToken();
        const url = `${LARK_API_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;

        const response = await axios.post(url, newRecord, {
            headers: buildAuthHeaders(token),
        });
        larkLogger.info(`created record ${response.data.msg} ${JSON.stringify(response.data.record)}`)
        return response.data;
    } catch (err) {
        errorLogger.error(`Error creating Lark record:: ${JSON.stringify(err.response?.data || err)}`)

        console.error("Error creating Lark record:", err.response?.data || err);
        throw err;
    }
};

// Update an existing Lark record
export const updateLarkRecord = async (recordId, newData) => {
    try {
        const token = await getLarkAccessToken();
        const url = `${LARK_API_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;

        const response = await axios.put(url, newData, {
            headers: buildAuthHeaders(token),
        });

        return response.data;
    } catch (err) {
        console.error("Error updating Lark record:", err.response?.data || err);
        throw err;
    }
};
