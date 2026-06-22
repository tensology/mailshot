import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
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

const matchesContactSearch = (contact, query) => {
    const haystack = [
        contact.name,
        contact.email,
        contact.phone,
        contact.company,
        contact.notes
    ].join(' ').toLowerCase();

    return haystack.includes(query);
};

const Contacts = () => {
    const navigate = useNavigate();
    const { openCompose } = useCompose();
    const getContactsService = useApi(API_URLS.getContacts);
    const createContactService = useApi(API_URLS.createContact);
    const updateContactService = useApi(API_URLS.updateContact);
    const deleteContactService = useApi(API_URLS.deleteContact);

    const [contacts, setContacts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
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

    const emailContact = (contact, event) => {
        event.stopPropagation();
        openCompose(contact.email);
    };

    const viewMailWithContact = (contact) => {
        if (!contact.email?.trim()) {
            return;
        }

        navigate(`${routes.emails.path}/allmail?participant=${encodeURIComponent(contact.email.trim())}`);
    };

    const normalizedSearch = searchQuery.trim().toLowerCase();
    const visibleContacts = useMemo(() => {
        if (!normalizedSearch) {
            return contacts;
        }

        return contacts.filter((contact) => matchesContactSearch(contact, normalizedSearch));
    }, [contacts, normalizedSearch]);

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

            <div className="relative mb-5 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search contacts"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none ring-blue-500 transition focus:border-blue-500 focus:ring-2"
                />
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
                                {visibleContacts.map((contact) => (
                                    <tr
                                        key={contact._id}
                                        className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50"
                                        onClick={() => viewMailWithContact(contact)}
                                    >
                                        <td className="px-4 py-3">{contact.name}</td>
                                        <td className="px-4 py-3 text-blue-700">{contact.email}</td>
                                        <td className="px-4 py-3">{contact.phone || '—'}</td>
                                        <td className="px-4 py-3">{contact.company || '—'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-1">
                                                <IconButton label="Compose" onClick={(event) => emailContact(contact, event)}>
                                                    <Mail className="h-4 w-4" />
                                                </IconButton>
                                                <IconButton label="Edit" onClick={(event) => { event.stopPropagation(); openEditDialog(contact); }}>
                                                    <Pencil className="h-4 w-4" />
                                                </IconButton>
                                                <IconButton label="Delete" onClick={(event) => { event.stopPropagation(); setContactToDelete(contact); }}>
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
                                {contacts.length > 0 && visibleContacts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                                            No contacts match your search.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-3 md:hidden">
                        {visibleContacts.map((contact) => (
                            <div key={contact._id} className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={() => viewMailWithContact(contact)}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <p className="font-medium text-slate-900">{contact.name}</p>
                                        <p className="text-sm text-blue-700">{contact.email}</p>
                                        {contact.phone && <p className="text-sm text-slate-500">{contact.phone}</p>}
                                        {contact.company && <p className="text-sm text-slate-500">{contact.company}</p>}
                                    </button>
                                    <div className="flex gap-1">
                                        <IconButton label="Compose" onClick={(event) => emailContact(contact, event)}>
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
                        {contacts.length > 0 && visibleContacts.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                                No contacts match your search.
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
