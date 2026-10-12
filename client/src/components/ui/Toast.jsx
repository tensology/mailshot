import { useEffect } from 'react';
import IconButton from './IconButton';
import MailshotIcon from './MailshotIcon';

const tones = {
    success: {
        icon: 'check',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800'
    },
    error: {
        icon: 'alert',
        className: 'border-red-200 bg-red-50 text-red-800'
    }
};

const Toast = ({
    open,
    message,
    severity = 'success',
    onClose,
    duration = 4000
}) => {
    useEffect(() => {
        if (!open || !duration) {
            return undefined;
        }

        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [open, duration, onClose]);

    if (!open || !message) {
        return null;
    }

    const tone = tones[severity] || tones.success;
    return (
        <div className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(24rem,calc(100vw-1.5rem))] justify-end sm:right-4">
            <div className={`pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-xl ${tone.className}`}>
                <MailshotIcon name={tone.icon} size={22} />
                <p className="min-w-0 flex-1 text-sm leading-5">{message}</p>
                <IconButton label="Dismiss" size="sm" className="shrink-0 hover:bg-black/5" onClick={onClose}>
                    <MailshotIcon name="close" size={20} />
                </IconButton>
            </div>
        </div>
    );
};

export default Toast;
