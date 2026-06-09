import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';

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
    return (
        <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <Typography color="text.secondary">{message}</Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onCancel} disabled={loading}>
                    {cancelLabel}
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={onConfirm}
                    disabled={loading}
                >
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ConfirmDialog;
