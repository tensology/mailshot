import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, TextField, Typography } from '@mui/material';
import { NavLink } from 'react-router-dom';
import { LabelOutlined } from '@mui/icons-material';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';

const LabelSidebar = () => {
    const getLabelsService = useApi(API_URLS.getLabels);
    const createLabelService = useApi(API_URLS.createLabel);
    const deleteLabelService = useApi(API_URLS.deleteLabel);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [labels, setLabels] = useState([]);

    const loadLabels = async () => {
        const result = await getLabelsService.call();
        if (!result.error && Array.isArray(result.data)) {
            setLabels(result.data);
        }
    };

    useEffect(() => {
        loadLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const createLabel = async () => {
        if (!name.trim()) {
            return;
        }

        const result = await createLabelService.call({ name: name.trim() });
        if (!result.error) {
            setOpen(false);
            setName('');
            loadLabels();
        }
    };

    const removeLabel = async (labelId) => {
        await deleteLabelService.call({}, labelId);
        loadLabels();
    };

    return (
        <Box sx={{ mt: 2, px: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">Labels</Typography>
                <Button size="small" onClick={() => setOpen(true)}>+</Button>
            </Box>
            <List dense sx={{ py: 0 }}>
                {labels.map((label) => (
                    <ListItem key={label._id} sx={{ py: 0.5, px: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <NavLink
                            to={`${routes.emails.path}/allmail?label=${encodeURIComponent(label.slug)}`}
                            style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}
                        >
                            <LabelOutlined sx={{ fontSize: 18, color: label.color || '#5f6368' }} />
                            <Typography variant="body2">{label.name}</Typography>
                        </NavLink>
                        <Button size="small" onClick={() => removeLabel(label._id)}>x</Button>
                    </ListItem>
                ))}
            </List>

            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>Create label</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Label name"
                        fullWidth
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={createLabel} variant="contained">Create</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default LabelSidebar;
