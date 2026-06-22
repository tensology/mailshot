import { useEffect, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { Tag } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import ConfirmDialog from './common/ConfirmDialog';
import Dialog, { DialogActions, DialogButton } from './ui/Dialog';
import Input from './ui/Input';

const labelNavClass = (isActive) => (
    `flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-sm transition ${
        isActive ? 'bg-blue-100 font-medium text-blue-800' : 'text-slate-700 hover:bg-slate-100'
    }`
);

const RESERVED_LABEL_SLUGS = new Set(['archived', 'archive', 'spam']);

const LabelSidebar = ({ counts = {}, onNavigate }) => {
    const [searchParams] = useSearchParams();
    const activeLabel = searchParams.get('label') || '';
    const getLabelsService = useApi(API_URLS.getLabels);
    const createLabelService = useApi(API_URLS.createLabel);
    const deleteLabelService = useApi(API_URLS.deleteLabel);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [labels, setLabels] = useState([]);
    const [labelToDelete, setLabelToDelete] = useState(null);

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

    const removeLabel = async () => {
        if (!labelToDelete) {
            return;
        }

        await deleteLabelService.call({}, labelToDelete._id);
        setLabelToDelete(null);
        loadLabels();
    };

    return (
        <div className="mt-4 px-1">
            <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Labels</span>
                <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-blue-600">
                    +
                </button>
            </div>
            <div className="space-y-1">
                {labels.filter((label) => !RESERVED_LABEL_SLUGS.has(label.slug)).map((label) => {
                    const unread = Number(counts[label.slug] || 0);

                    return (
                        <div key={label._id} className="flex items-center gap-1">
                            <NavLink
                                to={`${routes.emails.path}/allmail?label=${encodeURIComponent(label.slug)}`}
                                onClick={onNavigate}
                                className={labelNavClass(activeLabel === label.slug)}
                            >
                                <Tag className="h-4 w-4 shrink-0" style={{ color: label.color || '#64748b' }} />
                                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                                {unread > 0 && (
                                    <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                                        {unread}
                                    </span>
                                )}
                            </NavLink>
                            <button
                                type="button"
                                onClick={() => setLabelToDelete(label)}
                                aria-label={`Delete ${label.name}`}
                                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                                ×
                            </button>
                        </div>
                    );
                })}
            </div>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                title="Create label"
                footer={(
                    <DialogActions>
                        <DialogButton variant="secondary" onClick={() => setOpen(false)}>Cancel</DialogButton>
                        <DialogButton onClick={createLabel}>Create</DialogButton>
                    </DialogActions>
                )}
            >
                <Input
                    id="label-name"
                    label="Label name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                />
            </Dialog>

            <ConfirmDialog
                open={Boolean(labelToDelete)}
                title="Delete label?"
                message={labelToDelete
                    ? `Delete "${labelToDelete.name}"? The label will be removed from messages, but the messages will stay in your mailbox.`
                    : ''}
                confirmLabel="Delete label"
                onConfirm={removeLabel}
                onCancel={() => setLabelToDelete(null)}
            />
        </div>
    );
};

export default LabelSidebar;
