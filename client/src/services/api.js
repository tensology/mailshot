import axios from 'axios';
import { clearAuthToken, getAuthToken } from '../context/AuthContext';
import { API_URL } from '../config/env';

let logoutInFlight = false;

const handleUnauthorized = () => {
    if (logoutInFlight || window.location.pathname.startsWith('/login')) {
        return;
    }

    const token = getAuthToken();
    if (!token) {
        return;
    }

    logoutInFlight = true;
    clearAuthToken();
    window.location.href = '/login';
};

const buildUrl = (urlObject, type = '') => {
    const endpoint = urlObject.endpoint;

    if (urlObject.pathBuilder) {
        return `${API_URL}/${urlObject.pathBuilder(type, endpoint)}`;
    }

    if (type) {
        return `${API_URL}/${endpoint}/${type}`;
    }

    return `${API_URL}/${endpoint}`;
};

const API_GMAIL = async (urlObject, payload, type = '') => {
    let url = buildUrl(urlObject, type);

    if (urlObject.method === 'GET' && payload && typeof payload === 'object' && !urlObject.isMultipart) {
        const queryString = new URLSearchParams(payload).toString();
        if (queryString) {
            url = `${url}?${queryString}`;
        }
    }

    const token = getAuthToken();
    const config = {
        method: urlObject.method,
        url,
        data: urlObject.method === 'GET' ? undefined : payload,
        headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    };

    if (urlObject.isMultipart) {
        config.headers['Content-Type'] = 'multipart/form-data';
    }

    if (urlObject.responseType) {
        config.responseType = urlObject.responseType;
    }

    let response;
    try {
        response = await axios(config);
    } catch (error) {
        if (error?.response?.status === 401) {
            handleUnauthorized();
        }
        throw error;
    }

    if (
        urlObject.responseType !== 'blob'
        && typeof response.data === 'string'
        && response.data.trim().startsWith('<!doctype html')
    ) {
        throw new Error('API returned HTML instead of JSON. Rebuild the client or check the server is up to date.');
    }

    return response;
};

export default API_GMAIL;
