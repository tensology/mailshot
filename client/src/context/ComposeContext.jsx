import { createContext, useContext, useMemo, useState } from 'react';

const ComposeContext = createContext(null);

export const ComposeProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [composeState, setComposeState] = useState('normal');
    const [initialTo, setInitialTo] = useState('');

    const openCompose = (toEmail = '') => {
        setInitialTo(toEmail || '');
        setComposeState('normal');
        setIsOpen(true);
    };

    const closeCompose = () => {
        setIsOpen(false);
        setComposeState('normal');
        setInitialTo('');
    };

    const value = useMemo(() => ({
        isOpen,
        composeState,
        initialTo,
        openCompose,
        closeCompose,
        setComposeState
    }), [isOpen, composeState, initialTo]);

    return (
        <ComposeContext.Provider value={value}>
            {children}
        </ComposeContext.Provider>
    );
};

export const useCompose = () => {
    const context = useContext(ComposeContext);
    if (!context) {
        throw new Error('useCompose must be used within ComposeProvider');
    }
    return context;
};
