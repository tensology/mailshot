import { useEffect } from 'react';
import Dialog, { DialogActions, DialogButton } from '../ui/Dialog';

const ConfirmDialog = ({
    open,
    title = 'Confirm',
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    loading = false
}) => {
    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (!loading) {
                    onConfirm();
                }
            }
        };

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [loading, onConfirm, open]);

    return (
        <Dialog
            open={open}
            onClose={onCancel}
            title={title}
            footer={(
                <DialogActions>
                    <DialogButton variant="secondary" onClick={onCancel} disabled={loading}>
                        {cancelLabel}
                    </DialogButton>
                    <DialogButton variant="danger" onClick={onConfirm} disabled={loading} autoFocus>
                        {confirmLabel}
                    </DialogButton>
                </DialogActions>
            )}
        >
            <p className="text-sm text-slate-600">{message}</p>
        </Dialog>
    );
};

export default ConfirmDialog;
