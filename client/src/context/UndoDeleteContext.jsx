import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const UNDO_DURATION_MS = 60 * 1000;
const DEFAULT_DEFER_MS = 8 * 1000;

const UndoDeleteContext = createContext(null);

const UndoSnackbar = ({ open, message, onUndo, onDismiss, isUndoing, actionLabel = 'Undo' }) => {
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
                    {isUndoing ? 'Working…' : actionLabel}
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
    const [snackbar, setSnackbar] = useState({ open: false, message: '', actionLabel: 'Undo' });
    const [isUndoing, setIsUndoing] = useState(false);
    const restoreRef = useRef(null);
    const commitRef = useRef(null);
    const timerRef = useRef(null);
    const modeRef = useRef('undo'); // undo | defer

    const clearUndoTimer = useCallback(() => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const dismissUndo = useCallback(() => {
        clearUndoTimer();
        restoreRef.current = null;
        commitRef.current = null;
        modeRef.current = 'undo';
        setIsUndoing(false);
        setSnackbar({ open: false, message: '', actionLabel: 'Undo' });
    }, [clearUndoTimer]);

    const showUndoDelete = useCallback(({ message, restore }) => {
        if (!message || typeof restore !== 'function') {
            return;
        }

        clearUndoTimer();
        modeRef.current = 'undo';
        restoreRef.current = restore;
        commitRef.current = null;
        setIsUndoing(false);
        setSnackbar({ open: true, message, actionLabel: 'Undo' });

        timerRef.current = window.setTimeout(() => {
            dismissUndo();
        }, UNDO_DURATION_MS);
    }, [clearUndoTimer, dismissUndo]);

    /**
     * Delay a side effect (e.g. send). Undo cancels; timeout commits.
     */
    const showDeferredAction = useCallback(({
        message,
        delayMs = DEFAULT_DEFER_MS,
        commit,
        cancel,
        actionLabel = 'Undo'
    }) => {
        if (!message || typeof commit !== 'function') {
            return;
        }

        clearUndoTimer();
        modeRef.current = 'defer';
        restoreRef.current = typeof cancel === 'function' ? cancel : null;
        commitRef.current = commit;
        setIsUndoing(false);
        setSnackbar({ open: true, message, actionLabel });

        timerRef.current = window.setTimeout(async () => {
            const run = commitRef.current;
            commitRef.current = null;
            restoreRef.current = null;
            setSnackbar({ open: false, message: '', actionLabel: 'Undo' });
            if (run) {
                await run();
            }
        }, Math.max(1000, Number(delayMs) || DEFAULT_DEFER_MS));
    }, [clearUndoTimer]);

    const handleUndo = useCallback(async () => {
        if (isUndoing) {
            return;
        }

        if (modeRef.current === 'defer') {
            const cancel = restoreRef.current;
            clearUndoTimer();
            commitRef.current = null;
            setIsUndoing(true);
            try {
                if (cancel) {
                    await cancel();
                }
            } finally {
                dismissUndo();
            }
            return;
        }

        const restore = restoreRef.current;
        if (!restore) {
            return;
        }

        setIsUndoing(true);
        try {
            await restore();
        } finally {
            dismissUndo();
        }
    }, [clearUndoTimer, dismissUndo, isUndoing]);

    useEffect(() => () => clearUndoTimer(), [clearUndoTimer]);

    const value = useMemo(
        () => ({ showUndoDelete, showDeferredAction }),
        [showDeferredAction, showUndoDelete]
    );

    return (
        <UndoDeleteContext.Provider value={value}>
            {children}
            <UndoSnackbar
                open={snackbar.open}
                message={snackbar.message}
                onUndo={handleUndo}
                onDismiss={() => {
                    if (modeRef.current === 'defer' && commitRef.current) {
                        // Dismiss without undo still lets the deferred commit fire on timer.
                        setSnackbar({ open: false, message: '', actionLabel: 'Undo' });
                        return;
                    }
                    dismissUndo();
                }}
                isUndoing={isUndoing}
                actionLabel={snackbar.actionLabel}
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
