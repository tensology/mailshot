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
}) => (
    <Dialog
        open={open}
        onClose={onCancel}
        title={title}
        footer={(
            <DialogActions>
                <DialogButton variant="secondary" onClick={onCancel} disabled={loading}>
                    {cancelLabel}
                </DialogButton>
                <DialogButton variant="danger" onClick={onConfirm} disabled={loading}>
                    {confirmLabel}
                </DialogButton>
            </DialogActions>
        )}
    >
        <p className="text-sm text-slate-600">{message}</p>
    </Dialog>
);

export default ConfirmDialog;
