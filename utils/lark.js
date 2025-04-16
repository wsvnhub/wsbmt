import axios from "axios";
import { config } from "dotenv";

config();


const LARK_API_URL = "https://open.larksuite.com/open-apis";
const HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
};

const { APP_ID, APP_SECRET, APP_TOKEN, TABLE_ID } = process.env;

const getLarkAccessToken = async () => {
    const response = await axios.post(`${LARK_API_URL}/auth/v3/tenant_access_token/internal`, {
        app_id: APP_ID,
        app_secret: APP_SECRET,
    }, { headers: HEADERS });

    if (response.status !== 200) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.data.tenant_access_token;
};

export const createLarkRecord = async (newRecord) => {
    const token = await getLarkAccessToken();
    const url = `${LARK_API_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`;
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const response = await axios.post(url, newRecord, { headers });
    return response.data;
};

export const updateLarkRecord = async (recordId, newData) => {
    const token = await getLarkAccessToken();
    const url = `${LARK_API_URL}/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const response = await axios.put(url, newData, { headers });
    return response.data;
};