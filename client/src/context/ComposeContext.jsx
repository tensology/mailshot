import { createContext, useContext, useMemo, useState } from 'react';

const ComposeContext = createContext(null);

const emptyDraft = () => ({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    in_reply_to: '',
    references: [],
    forwarded_attachments: [],
    show_cc: false,
    show_bcc: false,
    title: 'New Message'
});

const createComposeId = () => (
    globalThis.crypto?.randomUUID?.() || `compose-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const createComposeItem = (nextDraft = {}) => ({
    id: createComposeId(),
    composeState: 'normal',
    draft: {
        ...emptyDraft(),
        ...nextDraft,
        references: Array.isArray(nextDraft.references) ? nextDraft.references : [],
        forwarded_attachments: Array.isArray(nextDraft.forwarded_attachments) ? nextDraft.forwarded_attachments : []
    }
});

export const ComposeProvider = ({ children }) => {
    const [composeItems, setComposeItems] = useState([]);

    const openCompose = (toEmail = '') => {
        setComposeItems((current) => [
            ...current,
            createComposeItem({
                to: toEmail || ''
            })
        ]);
    };

    const openComposeDraft = (nextDraft = {}) => {
        setComposeItems((current) => [...current, createComposeItem(nextDraft)]);
    };

    const closeCompose = (id) => {
        if (!id) {
            setComposeItems([]);
            return;
        }

        setComposeItems((current) => current.filter((item) => item.id !== id));
    };

    const setComposeState = (id, composeState) => {
        setComposeItems((current) => current.map((item) => (
            item.id === id ? { ...item, composeState } : item
        )));
    };

    const value = useMemo(() => ({
        composeItems,
        isOpen: composeItems.length > 0,
        composeState: composeItems[composeItems.length - 1]?.composeState || 'normal',
        draft: composeItems[composeItems.length - 1]?.draft || emptyDraft(),
        openCompose,
        openComposeDraft,
        closeCompose,
        setComposeState
    }), [composeItems]);

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
