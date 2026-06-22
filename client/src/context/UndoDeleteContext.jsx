import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const UNDO_DURATION_MS = 60 * 1000;

const UndoDeleteContext = createContext(null);

const UndoSnackbar = ({ open, message, onUndo, onDismiss, isUndoing }) => {
    if (!open) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[85] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">
            <div className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-full border border-slate-800 bg-slate-900 px-4 py-2.5 text-white shadow-2xl">
                <p className="min-w-0 flex-1 text-sm leading-5 text-slate-100">{message}</p>
                <button
                    type="button"
                    onClick={onUndo}
                    disabled={isUndoing}
                    className="shrink-0 text-sm font-semibold text-sky-300 transition hover:text-sky-200 disabled:cursor-wait disabled:opacity-70"
                >
                    {isUndoing ? 'Undoing…' : 'Undo'}
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="shrink-0 text-xs font-medium text-slate-400 transition hover:text-slate-200"
                    aria-label="Dismiss"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};

export const UndoDeleteProvider = ({ children }) => {
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const [isUndoing, setIsUndoing] = useState(false);
    const restoreRef = useRef(null);
    const timerRef = useRef(null);

    const clearUndoTimer = useCallback(() => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const dismissUndo = useCallback(() => {
        clearUndoTimer();
        restoreRef.current = null;
        setIsUndoing(false);
        setSnackbar({ open: false, message: '' });
    }, [clearUndoTimer]);

    const showUndoDelete = useCallback(({ message, restore }) => {
        if (!message || typeof restore !== 'function') {
            return;
        }

        clearUndoTimer();
        restoreRef.current = restore;
        setIsUndoing(false);
        setSnackbar({ open: true, message });

        timerRef.current = window.setTimeout(() => {
            dismissUndo();
        }, UNDO_DURATION_MS);
    }, [clearUndoTimer, dismissUndo]);

    const handleUndo = useCallback(async () => {
        const restore = restoreRef.current;
        if (!restore || isUndoing) {
            return;
        }

        setIsUndoing(true);
        try {
            await restore();
        } finally {
            dismissUndo();
        }
    }, [dismissUndo, isUndoing]);

    useEffect(() => () => clearUndoTimer(), [clearUndoTimer]);

    const value = useMemo(() => ({ showUndoDelete }), [showUndoDelete]);

    return (
        <UndoDeleteContext.Provider value={value}>
            {children}
            <UndoSnackbar
                open={snackbar.open}
                message={snackbar.message}
                onUndo={handleUndo}
                onDismiss={dismissUndo}
                isUndoing={isUndoing}
            />
        </UndoDeleteContext.Provider>
    );
};

export const useUndoDelete = () => {
    const context = useContext(UndoDeleteContext);
    if (!context) {
        throw new Error('useUndoDelete must be used within UndoDeleteProvider');
    }
    return context;
};
