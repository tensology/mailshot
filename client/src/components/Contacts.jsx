import { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    CircularProgress
} from '@mui/material';
import { Edit, Delete, Add, EmailOutlined } from '@mui/icons-material';
import { useOutletContext } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { useCompose } from '../context/ComposeContext';
import ConfirmDialog from './common/ConfirmDialog';

const emptyForm = {
    name: '',
    email: '',
    phone: '',
    company: '',
    notes: ''
};

const Contacts = () => {
    const { openDrawer } = useOutletContext();
    const { openCompose } = useCompose();
    const getContactsService = useApi(API_URLS.getContacts);
    const createContactService = useApi(API_URLS.createContact);
    const updateContactService = useApi(API_URLS.updateContact);
    const deleteContactService = useApi(API_URLS.deleteContact);

    const [contacts, setContacts] = useState([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [contactToDelete, setContactToDelete] = useState(null);

    const loadContacts = async () => {
        const result = await getContactsService.call();
        if (!result.error && Array.isArray(result.data)) {
            setContacts(result.data);
        }
    };

    useEffect(() => {
        loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreateDialog = () => {
        setEditingId(null);
        setForm(emptyForm);
        setDialogOpen(true);
    };

    const openEditDialog = (contact) => {
        setEditingId(contact._id);
        setForm({
            name: contact.name || '',
            email: contact.email || '',
            phone: contact.phone || '',
            company: contact.company || '',
            notes: contact.notes || ''
        });
        setDialogOpen(true);
    };

    const saveContact = async () => {
        if (!form.name.trim() || !form.email.trim()) {
            return;
        }

        const result = editingId
            ? await updateContactService.call(form, editingId)
            : await createContactService.call(form);

        if (!result.error) {
            setDialogOpen(false);
            setForm(emptyForm);
            setEditingId(null);
            loadContacts();
        }
    };

    const confirmDeleteContact = (contact) => {
        setContactToDelete(contact);
    };

    const removeContact = async () => {
        if (!contactToDelete) {
            return;
        }

        await deleteContactService.call({}, contactToDelete._id);
        setContactToDelete(null);
        loadContacts();
    };

    const emailContact = (contact) => {
        openCompose(contact.email);
    };

    return (
        <Box style={openDrawer ? { marginLeft: 250, width: '100%', padding: 24 } : { width: '100%', padding: 24 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Contacts</Typography>
                <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog} sx={{ textTransform: 'none' }}>
                    Add contact
                </Button>
            </Box>

            {getContactsService.isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Phone</TableCell>
                            <TableCell>Company</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {contacts.map((contact) => (
                            <TableRow key={contact._id} hover>
                                <TableCell>{contact.name}</TableCell>
                                <TableCell>{contact.email}</TableCell>
                                <TableCell>{contact.phone || '—'}</TableCell>
                                <TableCell>{contact.company || '—'}</TableCell>
                                <TableCell align="right">
                                    <IconButton size="small" onClick={() => emailContact(contact)} title="Compose">
                                        <EmailOutlined fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => openEditDialog(contact)} title="Edit">
                                        <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => confirmDeleteContact(contact)} title="Delete">
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {contacts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#5f6368' }}>
                                    No contacts yet. Add your first contact to quickly compose messages.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{editingId ? 'Edit contact' : 'Add contact'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                    <TextField
                        label="Name"
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        required
                    />
                    <TextField
                        label="Email"
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm({ ...form, email: event.target.value })}
                        required
                    />
                    <TextField
                        label="Phone"
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                    <TextField
                        label="Company"
                        value={form.company}
                        onChange={(event) => setForm({ ...form, company: event.target.value })}
                    />
                    <TextField
                        label="Notes"
                        value={form.notes}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        multiline
                        minRows={3}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={saveContact}>
                        {editingId ? 'Save' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={Boolean(contactToDelete)}
                title="Delete contact?"
                message={contactToDelete
                    ? `Are you sure you want to delete ${contactToDelete.name}? This cannot be undone.`
                    : ''}
                confirmLabel="Delete"
                onConfirm={removeContact}
                onCancel={() => setContactToDelete(null)}
            />
        </Box>
    );
};

export default Contacts;
