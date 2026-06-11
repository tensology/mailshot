import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Archive, OctagonAlert, RefreshCw, Trash2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import Email from './Email';
import NoMails from './common/NoMails';
import { EMPTY_TABS } from '../constants/constant';
import {
    readEmailListCache,
    writeEmailListCache,
    removeEmailsFromListCache,
    clearEmailListCache,
    consumeActionError,
    consumeActionNotice
} from '../utils/emailListCache';
import ConfirmDialog from './common/ConfirmDialog';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
import MoveToLabelMenu from './MoveToLabelMenu';
import Toast from './ui/Toast';
import { buildLabelNameMap, getLabelDisplayName } from '../utils/labels';

const SYNC_TYPES = new Set(['allmail', 'inbox', 'starred', 'bin']);
const PAGE_SIZE = 50;
const BACKGROUND_SYNC_MS = 60000;

const normalizeEmailListResponse = (data) => {
    if (Array.isArray(data)) {
        return {
            emails: data,
            total: data.length,
            page: 1,
            total_pages: 1
        };
    }

    return {
        emails: Array.isArray(data?.emails) ? data.emails : [],
        total: Number(data?.total) || 0,
        page: Number(data?.page) || 1,
        total_pages: Number(data?.total_pages) || 1
    };
};

const tabTitles = {
    inbox: 'Inbox',
    starred: 'Starred',
    sent: 'Sent',
    drafts: 'Drafts',
    bin: 'Bin',
    allmail: 'All Mail',
    archived: 'Archived'
};

const Emails = () => {
    const { type } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const activeTab = EMPTY_TABS[type] ? type : 'inbox';
    const labelFilter = searchParams.get('label') || '';
    const searchFilter = searchParams.get('search') || '';
    const participantFilter = searchParams.get('participant') || '';
    const [page, setPage] = useState(1);
    const listCacheParams = { activeTab, labelFilter, searchFilter, participantFilter, page };

    const [starredEmail, setStarredEmail] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [highlightedEmail, setHighlightedEmail] = useState('');
    const [deleteTargetIds, setDeleteTargetIds] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [emails, setEmails] = useState(() => readEmailListCache(listCacheParams) || []);
    const [isFetching, setIsFetching] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasCache, setHasCache] = useState(() => Boolean(readEmailListCache(listCacheParams)?.length));
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [totalPages, setTotalPages] = useState(1);
    const [totalEmails, setTotalEmails] = useState(0);
    const [syncError, setSyncError] = useState('');
    const [syncNotice, setSyncNotice] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const [labelNameMap, setLabelNameMap] = useState(new Map());
    const [availableLabels, setAvailableLabels] = useState([]);

    const getEmailsService = useApi(API_URLS.getEmailFromType);
    const getLabelsService = useApi(API_URLS.getLabels);
    const searchEmailsService = useApi(API_URLS.searchEmails);
    const syncMailboxService = useApi(API_URLS.syncMailbox);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const archiveEmailsService = useApi(API_URLS.archiveEmails);
    const markSpamEmailsService = useApi(API_URLS.markSpamEmails);

    const syncRequestId = useRef(0);
    const listRequestId = useRef(0);
    const syncNoticeTimer = useRef(null);
    const selectionAnchorIndex = useRef(null);
    const pendingFocusPosition = useRef(null);

    const focusEmailRow = (emailId) => {
        window.requestAnimationFrame(() => {
            const escapedId = window.CSS?.escape ? window.CSS.escape(emailId) : String(emailId).replace(/"/g, '\\"');
            document.querySelector(`[data-email-row-id="${escapedId}"]`)?.focus();
        });
    };

    const fetchEmailList = useCallback(async ({ silent = false, pageOverride, requestId } = {}) => {
        const activeRequestId = requestId ?? ++listRequestId.current;
        const listPage = pageOverride ?? page;
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, page: listPage };
        if (!silent) {
            setIsFetching(true);
        }

        let fetchResult;
        if (searchFilter) {
            fetchResult = await searchEmailsService.call({ q: searchFilter, page: listPage, limit: PAGE_SIZE }, '', { silent: true });
        } else {
            const query = {
                page: listPage,
                limit: PAGE_SIZE,
                ...(labelFilter ? { label: labelFilter } : {}),
                ...(participantFilter ? { participant: participantFilter } : {})
            };
            fetchResult = await getEmailsService.call(query, activeTab, { silent: true });
        }

        if (!silent) {
            setIsFetching(false);
        }

        if (activeRequestId !== listRequestId.current) {
            return false;
        }

        if (fetchResult.error) {
            setLoadError(fetchResult.error);
            setEmails([]);
            setTotalEmails(0);
            setTotalPages(1);
            return false;
        }

        const normalized = normalizeEmailListResponse(fetchResult.data);
        setEmails(normalized.emails);
        setTotalEmails(normalized.total);
        setTotalPages(normalized.total_pages);
        setLoadError('');
        writeEmailListCache(cacheParams, normalized.emails);
        setHasCache(true);
        return true;
    }, [activeTab, labelFilter, searchFilter, participantFilter, getEmailsService, page, searchEmailsService]);

    const runMailboxSync = useCallback(async ({ silent = true, listPage, listRequestId: listRequestIdOverride } = {}) => {
        if (searchFilter || participantFilter || !SYNC_TYPES.has(activeTab)) {
            return { ok: true };
        }

        const requestId = ++syncRequestId.current;
        setIsSyncing(true);
        if (!silent) {
            setSyncError('');
        }

        const syncResult = await syncMailboxService.call({}, '', { silent: true });

        if (requestId !== syncRequestId.current) {
            return { ok: false };
        }

        setIsSyncing(false);

        const syncPayload = syncResult.data;
        const errorMessage = syncResult.error
            || (syncPayload && typeof syncPayload === 'object' && syncPayload.error ? String(syncPayload.error) : '');

        if (errorMessage) {
            setSyncError(errorMessage);
            setSyncNotice('');
            if (!hasCache && emails.length === 0) {
                setLoadError(errorMessage);
            }
            return { ok: false, error: errorMessage };
        }

        setSyncError('');
        await fetchEmailList({
            silent: true,
            pageOverride: listPage,
            requestId: listRequestIdOverride ?? listRequestId.current
        });

        const syncedCount = Number(syncPayload?.synced) || 0;
        const skippedCount = Number(syncPayload?.skipped) || 0;

        return {
            ok: true,
            synced: syncedCount,
            skipped: skippedCount,
            synced_at: syncPayload?.synced_at || null
        };
    }, [activeTab, emails.length, fetchEmailList, hasCache, participantFilter, searchFilter, syncMailboxService]);

    const syncInBackground = useCallback(() => runMailboxSync({ silent: true }), [runMailboxSync]);

    const loadEmails = useCallback(async () => {
        const requestId = ++listRequestId.current;
        setLoadError('');
        setSyncError('');

        const cachedEmails = readEmailListCache(listCacheParams);
        if (cachedEmails?.length) {
            setEmails(cachedEmails);
            setHasCache(true);
        } else {
            setEmails([]);
            setHasCache(false);
        }

        const fetchPromise = fetchEmailList({
            silent: Boolean(cachedEmails?.length),
            requestId
        });
        const syncPromise = runMailboxSync({
            silent: Boolean(cachedEmails?.length),
            listRequestId: requestId
        });

        await Promise.all([fetchPromise, syncPromise]);
    }, [activeTab, labelFilter, searchFilter, participantFilter, fetchEmailList, runMailboxSync]);

    const showSyncNotice = useCallback((message) => {
        setSyncNotice(message);
        if (syncNoticeTimer.current) {
            clearTimeout(syncNoticeTimer.current);
        }
        syncNoticeTimer.current = setTimeout(() => {
            setSyncNotice('');
        }, 4000);
    }, []);

    const showActionToast = useCallback((message, severity = 'success') => {
        setSnackbar({ open: true, message, severity });
    }, []);

    const refreshMailbox = useCallback(async () => {
        clearEmailListCache();
        setSyncNotice('');
        setSyncError('');

        if (page !== 1) {
            setPage(1);
        }

        const result = await runMailboxSync({ silent: false, listPage: 1 });
        if (!result.ok) {
            return;
        }

        if (result.synced > 0) {
            showSyncNotice(`${result.synced} new message${result.synced === 1 ? '' : 's'}`);
            return;
        }

        showSyncNotice('Up to date');
    }, [page, runMailboxSync, showSyncNotice]);

    useEffect(() => {
        getLabelsService.call().then((result) => {
            if (!result.error && Array.isArray(result.data)) {
                setAvailableLabels(result.data);
                setLabelNameMap(buildLabelNameMap(result.data));
            }
        });

        const onActionNotice = (event) => {
            showActionToast(event.detail.message);
        };
        const onActionError = (event) => {
            showActionToast(event.detail.message, 'error');
        };

        window.addEventListener('mailshot:action-notice', onActionNotice);
        window.addEventListener('mailshot:action-error', onActionError);

        const actionNotice = consumeActionNotice();
        if (actionNotice) {
            showActionToast(actionNotice);
        }

        const actionError = consumeActionError();
        if (actionError) {
            showActionToast(actionError, 'error');
        }

        return () => {
            window.removeEventListener('mailshot:action-notice', onActionNotice);
            window.removeEventListener('mailshot:action-error', onActionError);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, labelFilter, searchFilter, participantFilter, starredEmail, page]);

    useEffect(() => {
        if (!pendingFocusPosition.current || emails.length === 0) {
            return;
        }

        const nextIndex = pendingFocusPosition.current === 'last' ? emails.length - 1 : 0;
        const nextEmail = emails[nextIndex];
        pendingFocusPosition.current = null;
        if (nextEmail?._id) {
            setHighlightedEmail(nextEmail._id);
            focusEmailRow(nextEmail._id);
        }
    }, [emails]);

    useEffect(() => {
        if (searchFilter || participantFilter || !SYNC_TYPES.has(activeTab)) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            syncInBackground();
        }, BACKGROUND_SYNC_MS);

        return () => clearInterval(intervalId);
    }, [activeTab, participantFilter, searchFilter, syncInBackground]);

    useEffect(() => () => {
        if (syncNoticeTimer.current) {
            clearTimeout(syncNoticeTimer.current);
        }
    }, []);

    useEffect(() => {
        setSelectedEmails([]);
        setHighlightedEmail('');
        setDeleteTargetIds([]);
        setPage(1);
        setTotalEmails(0);
        setTotalPages(1);
    }, [activeTab, labelFilter, searchFilter, participantFilter]);

    const listTitle = searchFilter
        ? `Search: ${searchFilter}`
        : participantFilter
            ? `Mail with ${participantFilter}`
            : labelFilter
                ? getLabelDisplayName(labelFilter, labelNameMap)
                : tabTitles[activeTab] || 'Mail';

    const showBlockingLoader = emails.length === 0 && (isFetching || isSyncing);
    const hasSelection = selectedEmails.length > 0;
    const allSelected = emails.length > 0 && selectedEmails.length === emails.length;
    const someSelected = hasSelection && !allSelected;
    const isRefreshing = isFetching || isSyncing;

    const selectAllEmails = (event) => {
        if (event.target.checked) {
            setSelectedEmails(emails.map((email) => email._id));
        } else {
            setSelectedEmails([]);
        }
        selectionAnchorIndex.current = null;
    };

    const selectRangeFromAnchor = (toIndex) => {
        const fromIndex = selectionAnchorIndex.current ?? toIndex;
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const rangeIds = emails.slice(start, end + 1).map((email) => email._id);
        setSelectedEmails((current) => [...new Set([...current, ...rangeIds])]);
    };

    const handleRowSelect = (email, index, event) => {
        setHighlightedEmail(email._id);
    };

    const handleCheckboxSelect = (email, index, event) => {
        if (event.shiftKey) {
            selectRangeFromAnchor(index);
            return;
        }

        setSelectedEmails((current) => (
            current.includes(email._id)
                ? current.filter((id) => id !== email._id)
                : [...current, email._id]
        ));
        selectionAnchorIndex.current = index;
    };

    const handleKeyboardDelete = (email) => {
        setDeleteTargetIds([email._id]);
        setConfirmDeleteOpen(true);
    };

    const handleKeyboardNavigate = (index, direction) => {
        const nextIndex = index + direction;
        if (nextIndex >= 0 && nextIndex < emails.length) {
            const nextEmail = emails[nextIndex];
            setHighlightedEmail(nextEmail._id);
            focusEmailRow(nextEmail._id);
            return;
        }

        if (direction > 0 && page < totalPages) {
            pendingFocusPosition.current = 'first';
            setPage((value) => Math.min(totalPages, value + 1));
            return;
        }

        if (direction < 0 && page > 1) {
            pendingFocusPosition.current = 'last';
            setPage((value) => Math.max(1, value - 1));
        }
    };

    const archiveSelectedEmails = async () => {
        if (!selectedEmails.length) {
            return;
        }
        await archiveEmailsService.call(selectedEmails);
        setSelectedEmails([]);
        setStarredEmail((prevState) => !prevState);
    };

    const requestDeleteSelectedEmails = () => {
        if (!selectedEmails.length) {
            return;
        }
        setDeleteTargetIds([...selectedEmails]);
        setConfirmDeleteOpen(true);
    };

    const markSelectedAsSpam = async () => {
        if (!selectedEmails.length) {
            return;
        }

        const idsToRemove = [...selectedEmails];
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, page };
        const previousEmails = emails;
        const previousTotal = totalEmails;
        const nextEmails = previousEmails.filter((email) => !idsToRemove.includes(email._id));

        setSelectedEmails([]);
        setEmails(nextEmails);
        setTotalEmails(Math.max(0, previousTotal - idsToRemove.length));
        removeEmailsFromListCache(idsToRemove);
        writeEmailListCache(cacheParams, nextEmails);

        const result = await markSpamEmailsService.call(idsToRemove);
        if (result.error) {
            setEmails(previousEmails);
            setTotalEmails(previousTotal);
            writeEmailListCache(cacheParams, previousEmails);
            showActionToast(result.error, 'error');
            return;
        }

        showActionToast(`${idsToRemove.length} message${idsToRemove.length === 1 ? '' : 's'} marked as spam`);
    };

    const moveSelectedToLabel = (labelSlug, ids, error) => {
        if (error) {
            setSyncError(error);
            return;
        }

        const idSet = new Set(ids);
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, page };
        const previousEmails = emails;
        const shouldRemoveFromView = activeTab === 'inbox' || labelFilter;

        if (!shouldRemoveFromView) {
            setSelectedEmails([]);
            return;
        }

        const nextEmails = previousEmails.filter((email) => !idSet.has(email._id));
        setEmails(nextEmails);
        setTotalEmails(Math.max(0, totalEmails - ids.length));
        setSelectedEmails([]);
        removeEmailsFromListCache(ids);
        writeEmailListCache(cacheParams, nextEmails);
    };

    const confirmMoveToLabel = (labelSlug, ids) => {
        const labelName = getLabelDisplayName(labelSlug, labelNameMap);
        const message = ids.length === 1
            ? `Moved to ${labelName}`
            : `${ids.length} messages moved to ${labelName}`;
        showActionToast(message);
    };

    const deleteSelectedEmails = () => {
        const idsForDelete = deleteTargetIds.length ? deleteTargetIds : selectedEmails;

        if (!idsForDelete.length) {
            return;
        }

        const idsToRemove = [...idsForDelete];
        const isPermanentDelete = type === 'bin';
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, page };
        const previousEmails = emails;
        const previousTotal = totalEmails;
        const nextEmails = previousEmails.filter((email) => !idsToRemove.includes(email._id));
        const nextTotal = Math.max(0, previousTotal - idsToRemove.length);
        const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        const nextPage = Math.min(page, nextTotalPages);
        const nextCacheParams = { activeTab, labelFilter, searchFilter, participantFilter, page: nextPage };

        setConfirmDeleteOpen(false);
        setDeleteTargetIds([]);
        setSelectedEmails([]);
        setEmails(nextEmails);
        setTotalEmails(nextTotal);
        setTotalPages(nextTotalPages);
        if (nextPage !== page) {
            setPage(nextPage);
        }
        removeEmailsFromListCache(idsToRemove);
        writeEmailListCache(nextCacheParams, nextEmails);

        const apiCall = isPermanentDelete
            ? deleteEmailsService.call(idsToRemove)
            : moveEmailsToBin.call(idsToRemove);

        apiCall.then((result) => {
            if (result.error) {
                setEmails(previousEmails);
                setTotalEmails(previousTotal);
                setTotalPages(Math.max(1, Math.ceil(previousTotal / PAGE_SIZE)));
                setPage(page);
                setDeleteTargetIds(idsToRemove);
                writeEmailListCache(cacheParams, previousEmails);
                showActionToast(result.error, 'error');
                return;
            }

            const count = idsToRemove.length;
            const message = isPermanentDelete
                ? `${count} message${count === 1 ? '' : 's'} deleted permanently`
                : `${count} message${count === 1 ? '' : 's'} moved to Bin`;
            showActionToast(message);
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            {isSyncing && emails.length > 0 && (
                <div className="h-0.5 w-full overflow-hidden bg-slate-100">
                    <div className="h-full w-1/3 animate-pulse bg-blue-500" />
                </div>
            )}

            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur sm:px-4">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(input) => {
                            if (input) {
                                input.indeterminate = someSelected;
                            }
                        }}
                        onChange={selectAllEmails}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <IconButton label="Refresh" onClick={refreshMailbox} disabled={isRefreshing}>
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </IconButton>
                    {hasSelection && type !== 'bin' && (
                        <IconButton label="Archive" onClick={archiveSelectedEmails}>
                            <Archive className="h-4 w-4" />
                        </IconButton>
                    )}
                    {hasSelection && type !== 'bin' && type !== 'spam' && (
                        <IconButton label="Mark as spam" onClick={markSelectedAsSpam}>
                            <OctagonAlert className="h-4 w-4" />
                        </IconButton>
                    )}
                    {hasSelection && type !== 'bin' && availableLabels.length > 0 && (
                        <MoveToLabelMenu
                            emailIds={selectedEmails}
                            labels={availableLabels}
                            onMoved={moveSelectedToLabel}
                            onMoveConfirmed={confirmMoveToLabel}
                        />
                    )}
                    {hasSelection && (
                        <IconButton label="Delete" onClick={requestDeleteSelectedEmails}>
                            <Trash2 className="h-4 w-4" />
                        </IconButton>
                    )}
                    <div className="ml-auto min-w-0 text-right">
                        <p className="truncate text-sm font-medium text-slate-800">
                            {listTitle}
                        </p>
                        {isSyncing && emails.length > 0 && (
                            <p className="text-xs text-slate-500">Checking for new mail…</p>
                        )}
                        {!isSyncing && syncNotice && (
                            <p className="text-xs font-medium text-emerald-600">{syncNotice}</p>
                        )}
                        {!isSyncing && !syncNotice && syncError && (
                            <p className="truncate text-xs text-red-600">{syncError}</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                {showBlockingLoader && (
                    <div className="flex items-center justify-center gap-3 py-16">
                        <Spinner size={28} />
                        <span className="text-sm text-slate-500">Loading messages…</span>
                    </div>
                )}

                {emails.length > 0 && (
                    <div className={isFetching && !isSyncing ? 'opacity-90 transition-opacity' : ''}>
                        {emails.map((email, index) => (
                            <Email
                                email={email}
                                index={index}
                                key={email._id || email.messageId}
                                setStarredEmail={setStarredEmail}
                                checkedEmails={selectedEmails}
                                highlightedEmail={highlightedEmail}
                                labelNameMap={labelNameMap}
                                onRowSelect={handleRowSelect}
                                onCheckboxSelect={handleCheckboxSelect}
                                onKeyboardDelete={handleKeyboardDelete}
                                onKeyboardNavigate={handleKeyboardNavigate}
                                deleteDialogOpen={confirmDeleteOpen}
                            />
                        ))}
                    </div>
                )}

                {!showBlockingLoader && loadError && emails.length === 0 && (
                    <NoMails message={{ heading: 'Could not load messages', subHeading: loadError }} />
                )}

                {!showBlockingLoader && !loadError && emails.length === 0 && (
                    <NoMails message={searchFilter
                        ? { heading: 'No messages found', subHeading: `No results for "${searchFilter}"` }
                        : participantFilter
                            ? { heading: 'No messages found', subHeading: `No mail with ${participantFilter}` }
                            : EMPTY_TABS[activeTab]} />
                )}
            </div>

            {totalPages > 1 && (
                <div className="grid items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:grid-cols-[1fr_auto_1fr]">
                    <span className="text-center sm:text-left">
                        {totalEmails} messages
                    </span>
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((value) => Math.max(1, value - 1))}
                        >
                            Previous
                        </Button>
                        <label className="flex items-center gap-2 whitespace-nowrap">
                            <span>Page</span>
                            <select
                                value={page}
                                onChange={(event) => setPage(Number(event.target.value))}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                                    <option key={pageNumber} value={pageNumber}>
                                        {pageNumber}
                                    </option>
                                ))}
                            </select>
                            <span>of {totalPages}</span>
                        </label>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                        >
                            Next
                        </Button>
                    </div>
                    <span className="hidden text-right sm:block">
                        Page {page} of {totalPages}
                    </span>
                </div>
            )}

            {(searchFilter || participantFilter) && (
                <div className="border-t border-slate-100 px-4 py-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(searchFilter ? `${routes.emails.path}/inbox` : `${routes.emails.path}/allmail`)}
                    >
                        {searchFilter ? 'Clear search' : 'Clear filter'}
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={confirmDeleteOpen}
                title={type === 'bin' ? 'Delete forever?' : 'Move to Bin?'}
                message={type === 'bin'
                    ? `Permanently delete ${(deleteTargetIds.length || selectedEmails.length)} selected message${(deleteTargetIds.length || selectedEmails.length) === 1 ? '' : 's'}? This cannot be undone.`
                    : `Move ${(deleteTargetIds.length || selectedEmails.length)} selected message${(deleteTargetIds.length || selectedEmails.length) === 1 ? '' : 's'} to Bin?`}
                confirmLabel={type === 'bin' ? 'Delete forever' : 'Move to Bin'}
                onConfirm={deleteSelectedEmails}
                onCancel={() => {
                    setConfirmDeleteOpen(false);
                    setDeleteTargetIds([]);
                }}
            />

            <Toast
                open={snackbar.open}
                message={snackbar.message}
                severity={snackbar.severity}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            />
        </div>
    );
};

export default Emails;
