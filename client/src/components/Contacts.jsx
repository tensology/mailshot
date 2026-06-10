import { useEffect, useState } from 'react';
import { Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { useCompose } from '../context/ComposeContext';
import ConfirmDialog from './common/ConfirmDialog';
import Button from './ui/Button';
import Dialog, { DialogActions, DialogButton } from './ui/Dialog';
import Input from './ui/Input';
import Spinner from './ui/Spinner';
import Textarea from './ui/Textarea';
import IconButton from './ui/IconButton';

const emptyForm = {
    name: '',
    email: '',
    phone: '',
    company: '',
    notes: ''
};

const Contacts = () => {
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
        <div className="h-full overflow-y-auto bg-white px-4 py-5 sm:px-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
                    <p className="text-sm text-slate-500">Manage people you email often.</p>
                </div>
                <Button onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" />
                    Add contact
                </Button>
            </div>

            {getContactsService.isLoading ? (
                <div className="flex justify-center py-16">
                    <Spinner size={28} />
                </div>
            ) : (
                <>
                    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-left text-slate-600">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Name</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Phone</th>
                                    <th className="px-4 py-3 font-medium">Company</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contacts.map((contact) => (
                                    <tr key={contact._id} className="border-t border-slate-100">
                                        <td className="px-4 py-3">{contact.name}</td>
                                        <td className="px-4 py-3">{contact.email}</td>
                                        <td className="px-4 py-3">{contact.phone || '—'}</td>
                                        <td className="px-4 py-3">{contact.company || '—'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-1">
                                                <IconButton label="Compose" onClick={() => emailContact(contact)}>
                                                    <Mail className="h-4 w-4" />
                                                </IconButton>
                                                <IconButton label="Edit" onClick={() => openEditDialog(contact)}>
                                                    <Pencil className="h-4 w-4" />
                                                </IconButton>
                                                <IconButton label="Delete" onClick={() => setContactToDelete(contact)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </IconButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {contacts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                                            No contacts yet. Add your first contact to quickly compose messages.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-3 md:hidden">
                        {contacts.map((contact) => (
                            <div key={contact._id} className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900">{contact.name}</p>
                                        <p className="text-sm text-slate-600">{contact.email}</p>
                                        {contact.phone && <p className="text-sm text-slate-500">{contact.phone}</p>}
                                        {contact.company && <p className="text-sm text-slate-500">{contact.company}</p>}
                                    </div>
                                    <div className="flex gap-1">
                                        <IconButton label="Compose" onClick={() => emailContact(contact)}>
                                            <Mail className="h-4 w-4" />
                                        </IconButton>
                                        <IconButton label="Edit" onClick={() => openEditDialog(contact)}>
                                            <Pencil className="h-4 w-4" />
                                        </IconButton>
                                        <IconButton label="Delete" onClick={() => setContactToDelete(contact)}>
                                            <Trash2 className="h-4 w-4" />
                                        </IconButton>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {contacts.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                                No contacts yet. Add your first contact to quickly compose messages.
                            </div>
                        )}
                    </div>
                </>
            )}

            <Dialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title={editingId ? 'Edit contact' : 'Add contact'}
                footer={(
                    <DialogActions>
                        <DialogButton variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</DialogButton>
                        <DialogButton onClick={saveContact}>{editingId ? 'Save' : 'Create'}</DialogButton>
                    </DialogActions>
                )}
            >
                <div className="space-y-3">
                    <Input label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                    <Input label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                    <Input label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                    <Input label="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
                    <Textarea label="Notes" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                </div>
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
        </div>
    );
};

export default Contacts;
