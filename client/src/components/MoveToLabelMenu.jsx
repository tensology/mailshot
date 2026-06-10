import { useEffect, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import IconButton from './ui/IconButton';
import { getLabelDisplayName } from '../utils/labels';

const MoveToLabelMenu = ({
    emailIds = [],
    labels = [],
    onMoved,
    onMoveConfirmed,
    disabled = false,
    buttonLabel = 'Move to'
}) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    const moveToLabelService = useApi(API_URLS.moveEmailsToLabel);

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const onPointerDown = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    const moveToLabel = (labelSlug) => {
        if (!emailIds.length || !labelSlug) {
            return;
        }

        setOpen(false);
        if (onMoved) {
            onMoved(labelSlug, emailIds);
        }

        moveToLabelService.call({ ids: emailIds, label: labelSlug }, '', { silent: true }).then((result) => {
            if (result.error) {
                if (onMoved) {
                    onMoved(labelSlug, emailIds, result.error);
                }
                return;
            }

            if (onMoveConfirmed) {
                onMoveConfirmed(labelSlug, emailIds);
            }
        });
    };

    if (!labels.length) {
        return null;
    }

    return (
        <div className="relative" ref={menuRef}>
            <IconButton
                label={buttonLabel}
                disabled={disabled || !emailIds.length}
                onClick={() => setOpen((value) => !value)}
            >
                <Tag className="h-4 w-4" />
            </IconButton>

            {open && (
                <div className="absolute left-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {buttonLabel}
                    </p>
                    {labels.map((label) => (
                        <button
                            key={label._id}
                            type="button"
                            onClick={() => moveToLabel(label.slug)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                            <Tag className="h-3.5 w-3.5 shrink-0" style={{ color: label.color || '#64748b' }} />
                            {getLabelDisplayName(label.slug, new Map([[label.slug, label.name]]))}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MoveToLabelMenu;
