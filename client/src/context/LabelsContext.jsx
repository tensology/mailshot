import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { buildLabelNameMap } from '../utils/labels';

const LabelsContext = createContext(null);

export const LabelsProvider = ({ children }) => {
    const { call: getLabels } = useApi(API_URLS.getLabels);
    const [labels, setLabels] = useState([]);
    const requestId = useRef(0);

    const refreshLabels = useCallback(async () => {
        const id = ++requestId.current;
        const { data } = await getLabels(undefined, '', { silent: true });
        if (id === requestId.current && Array.isArray(data)) {
            setLabels(data);
        }
    }, [getLabels]);

    useEffect(() => {
        refreshLabels();
        return () => { requestId.current += 1; };
    }, [refreshLabels]);

    const value = useMemo(() => ({
        labels,
        labelNameMap: buildLabelNameMap(labels),
        refreshLabels
    }), [labels, refreshLabels]);

    return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
};

export const useLabels = () => useContext(LabelsContext);
