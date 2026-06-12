import { useEffect, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import IconButton from './ui/IconButton';
import Dialog, { DialogActions, DialogButton } from './ui/Dialog';
import { getLabelDisplayName } from '../utils/labels';
import { requestMailboxCountsRefresh } from '../utils/emailListCache';

const MoveToLabelMenu = ({
    emailIds = [],
    selectionPayload = null,
    selectionCount,
    labels = [],
    onMoved,
    onMoveConfirmed,
    disabled = false,
    buttonLabel = 'Move to'
}) => {
    const [open, setOpen] = useState(false);
    const [pendingRule, setPendingRule] = useState(null);
    const [ruleSaving, setRuleSaving] = useState(false);
    const menuRef = useRef(null);
    const moveToLabelService = useApi(API_URLS.moveEmailsToLabel);
    const createLabelRuleService = useApi(API_URLS.createLabelRule);
    const hasSelection = Boolean(selectionPayload) || emailIds.length > 0;
    const selectedCount = Number(selectionCount) || emailIds.length;

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
        if (!hasSelection || !labelSlug) {
            return;
        }

        setOpen(false);

        const payload = selectionPayload
            ? { ...selectionPayload, label: labelSlug }
            : { ids: emailIds, label: labelSlug };

        moveToLabelService.call(payload, '', { silent: true }).then((result) => {
            const affectedCount = Number(result.data?.updated) || selectedCount;
            if (result.error) {
                if (onMoved) {
                    onMoved(labelSlug, emailIds, result.error, affectedCount);
                }
                return;
            }

            requestMailboxCountsRefresh();

            if (Array.isArray(result.data?.senders) && result.data.senders.length > 0) {
                setPendingRule({
                    label: result.data.label || labelSlug,
                    senders: result.data.senders
                });
            }

            if (onMoved) {
                onMoved(labelSlug, emailIds, '', affectedCount);
            }
            if (onMoveConfirmed) {
                onMoveConfirmed(labelSlug, emailIds, affectedCount);
            }
        });
    };

    const dismissRulePrompt = () => {
        setPendingRule(null);
        setRuleSaving(false);
    };

    const createRule = async () => {
        if (!pendingRule) {
            return;
        }

        setRuleSaving(true);
        const result = await createLabelRuleService.call({
            from: pendingRule.senders,
            label: pendingRule.label
        }, '', { silent: true });

        setRuleSaving(false);
        if (result.error) {
            if (onMoved) {
                onMoved(pendingRule.label, emailIds, result.error);
            }
            return;
        }

        dismissRulePrompt();
    };

    if (!labels.length) {
        return null;
    }

    return (
        <>
            <div className="relative" ref={menuRef}>
                <IconButton
                    label={buttonLabel}
                    disabled={disabled || !hasSelection}
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

            <Dialog
                open={Boolean(pendingRule)}
                onClose={dismissRulePrompt}
                title="Create label rule?"
                footer={(
                    <DialogActions>
                        <DialogButton variant="secondary" onClick={dismissRulePrompt} disabled={ruleSaving}>
                            Just move this time
                        </DialogButton>
                        <DialogButton onClick={createRule} disabled={ruleSaving}>
                            Create rule
                        </DialogButton>
                    </DialogActions>
                )}
            >
                <p className="text-sm leading-6 text-slate-600">
                    {pendingRule?.senders?.length === 1
                        ? `Automatically move future emails from ${pendingRule.senders[0]} to ${getLabelDisplayName(pendingRule.label, new Map(labels.map((label) => [label.slug, label.name])))}?`
                        : `Automatically move future emails from these ${pendingRule?.senders?.length || 0} senders to ${getLabelDisplayName(pendingRule?.label, new Map(labels.map((label) => [label.slug, label.name])))}?`}
                </p>
                {pendingRule?.senders?.length > 1 && (
                    <div className="mt-3 max-h-32 overflow-y-auto rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
                        {pendingRule.senders.map((sender) => (
                            <div key={sender} className="truncate py-0.5">{sender}</div>
                        ))}
                    </div>
                )}
            </Dialog>
        </>
    );
};

export default MoveToLabelMenu;
