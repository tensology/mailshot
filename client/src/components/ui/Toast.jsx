import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import IconButton from './IconButton';

const tones = {
    success: {
        icon: CheckCircle2,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800'
    },
    error: {
        icon: AlertCircle,
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
    const Icon = tone.icon;

    return (
        <div className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(24rem,calc(100vw-1.5rem))] justify-end sm:right-4">
            <div className={`pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-xl ${tone.className}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <p className="min-w-0 flex-1 text-sm leading-5">{message}</p>
                <IconButton label="Dismiss" size="sm" className="shrink-0 hover:bg-black/5" onClick={onClose}>
                    <X className="h-4 w-4" />
                </IconButton>
            </div>
        </div>
    );
};

export default Toast;
