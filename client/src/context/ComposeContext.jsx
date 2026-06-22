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
    show_cc: false,
    show_bcc: false,
    title: 'New Message'
});

export const ComposeProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [composeState, setComposeState] = useState('normal');
    const [draft, setDraft] = useState(emptyDraft());

    const openCompose = (toEmail = '') => {
        setDraft({
            ...emptyDraft(),
            to: toEmail || ''
        });
        setComposeState('normal');
        setIsOpen(true);
    };

    const openComposeDraft = (nextDraft = {}) => {
        setDraft({
            ...emptyDraft(),
            ...nextDraft,
            references: Array.isArray(nextDraft.references) ? nextDraft.references : []
        });
        setComposeState('normal');
        setIsOpen(true);
    };

    const closeCompose = () => {
        setIsOpen(false);
        setComposeState('normal');
        setDraft(emptyDraft());
    };

    const value = useMemo(() => ({
        isOpen,
        composeState,
        draft,
        openCompose,
        openComposeDraft,
        closeCompose,
        setComposeState
    }), [isOpen, composeState, draft]);

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
