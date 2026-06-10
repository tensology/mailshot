import { useEffect } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
import IconButton from './IconButton';

const Dialog = ({
    open,
    onClose,
    title,
    children,
    footer
}) => {
    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
            <button
                type="button"
                aria-label="Close dialog"
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
                    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                    <IconButton label="Close" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>
                <div className="px-4 py-4 sm:px-5">{children}</div>
                {footer && (
                    <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export const DialogActions = ({ children }) => (
    <div className="flex flex-wrap justify-end gap-2">{children}</div>
);

export { Button as DialogButton };
export default Dialog;
