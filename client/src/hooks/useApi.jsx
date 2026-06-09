import { useState, useCallback } from 'react';
import API from '../services/api';

const getErrorMessage = (error) => {
    if (typeof error?.response?.data === 'string') {
        return error.response.data;
    }
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }
    return error?.message || 'Request failed';
};

const useApi = (urlObject) => {
    const [response, setResponse] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const call = useCallback(async (payload, type = '', options = {}) => {
        const silent = Boolean(options.silent);

        if (!silent) {
            setResponse(null);
            setIsLoading(true);
            setError('');
        }

        try {
            const res = await API(urlObject, payload, type);
            if (!silent) {
                setResponse(res.data);
            }
            return { data: res.data, error: '' };
        } catch (requestError) {
            const message = getErrorMessage(requestError);
            if (!silent) {
                setError(message);
            }
            return { data: null, error: message };
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    }, [urlObject]);

    return { call, response, error, isLoading };
};

export default useApi;
