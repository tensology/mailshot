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
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 safe-bottom">
            <div className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${tone.className}`}>
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="flex-1 text-sm">{message}</p>
                <IconButton label="Dismiss" size="sm" className="hover:bg-black/5" onClick={onClose}>
                    <X className="h-4 w-4" />
                </IconButton>
            </div>
        </div>
    );
};

export default Toast;
