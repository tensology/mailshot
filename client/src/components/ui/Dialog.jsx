import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import IconButton from './IconButton';
import MailshotIcon from './MailshotIcon';

const Dialog = ({
    open,
    onClose,
    title,
    children,
    footer,
    closeOnOverlayClick = true,
    maxWidthClassName = 'max-w-lg'
}) => {
    const bodyRef = useRef(null);
    const dialogRef = useRef(null);
    const titleId = useId();
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useLayoutEffect(() => {
        if (!open) {
            return;
        }

        bodyRef.current?.scrollTo({ top: 0, left: 0 });
        window.requestAnimationFrame(() => {
            bodyRef.current?.scrollTo({ top: 0, left: 0 });
        });
    }, [open]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const previousFocus = document.activeElement;
        const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"], [contenteditable="true"]') || [])].filter((element) => element.getClientRects().length);
        focusable()[0]?.focus();
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                onCloseRef.current();
            }
            if (event.key === 'Tab') {
                const items = focusable();
                const first = items[0];
                const last = items[items.length - 1];
                if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKeyDown);
            previousFocus?.focus();
        };
    }, [open]);

    if (!open) {
        return null;
    }

    return createPortal((
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
            <button
                type="button"
                aria-label="Close dialog"
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
                onClick={closeOnOverlayClick ? onClose : undefined}
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`relative z-10 flex w-full ${maxWidthClassName} flex-col overflow-hidden rounded-md bg-white dark:bg-slate-900 shadow-2xl`}
                style={{ maxHeight: 'calc(100dvh - 2rem)' }}
            >
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3 sm:px-5">
                    <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                    <IconButton label="Close" size="sm" onClick={onClose}>
                        <MailshotIcon name="close" size={20} />
                    </IconButton>
                </div>
                <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
                {footer && (
                    <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-3 sm:px-5">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    ), document.body);
};

export const DialogActions = ({ children }) => (
    <div className="flex flex-wrap justify-end gap-2">{children}</div>
);

export { Button as DialogButton };
export default Dialog;
