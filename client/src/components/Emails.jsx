import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Archive, RefreshCw, Trash2 } from 'lucide-react';
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
    consumeActionError
} from '../utils/emailListCache';
import ConfirmDialog from './common/ConfirmDialog';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
import MoveToLabelMenu from './MoveToLabelMenu';
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
    const [starredEmail, setStarredEmail] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [emails, setEmails] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasCache, setHasCache] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalEmails, setTotalEmails] = useState(0);
    const [syncError, setSyncError] = useState('');
    const [syncNotice, setSyncNotice] = useState('');

    const { type } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [labelNameMap, setLabelNameMap] = useState(new Map());
    const [availableLabels, setAvailableLabels] = useState([]);

    const getEmailsService = useApi(API_URLS.getEmailFromType);
    const getLabelsService = useApi(API_URLS.getLabels);
    const searchEmailsService = useApi(API_URLS.searchEmails);
    const syncMailboxService = useApi(API_URLS.syncMailbox);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const archiveEmailsService = useApi(API_URLS.archiveEmails);

    const syncRequestId = useRef(0);
    const syncNoticeTimer = useRef(null);

    const activeTab = EMPTY_TABS[type] ? type : 'inbox';
    const labelFilter = searchParams.get('label') || '';
    const searchFilter = searchParams.get('search') || '';

    const fetchEmailList = useCallback(async ({ silent = false, pageOverride } = {}) => {
        const cacheParams = { activeTab, labelFilter, searchFilter };
        const listPage = pageOverride ?? page;
        if (!silent) {
            setIsFetching(true);
        }

        let fetchResult;
        if (searchFilter) {
            fetchResult = await searchEmailsService.call({ q: searchFilter, page: listPage, limit: PAGE_SIZE }, '', { silent: true });
        } else {
            const query = { page: listPage, limit: PAGE_SIZE, ...(labelFilter ? { label: labelFilter } : {}) };
            fetchResult = await getEmailsService.call(query, activeTab, { silent: true });
        }

        if (!silent) {
            setIsFetching(false);
        }

        if (fetchResult.error) {
            if (!hasCache && emails.length === 0) {
                setLoadError(fetchResult.error);
                setEmails([]);
            }
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
    }, [activeTab, labelFilter, searchFilter, emails.length, getEmailsService, hasCache, page, searchEmailsService]);

    const runMailboxSync = useCallback(async ({ silent = true, listPage } = {}) => {
        if (searchFilter || !SYNC_TYPES.has(activeTab)) {
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
        await fetchEmailList({ silent: true, pageOverride: listPage });

        const syncedCount = Number(syncPayload?.synced) || 0;
        const skippedCount = Number(syncPayload?.skipped) || 0;

        return {
            ok: true,
            synced: syncedCount,
            skipped: skippedCount,
            synced_at: syncPayload?.synced_at || null
        };
    }, [activeTab, emails.length, fetchEmailList, hasCache, searchFilter, syncMailboxService]);

    const syncInBackground = useCallback(() => runMailboxSync({ silent: true }), [runMailboxSync]);

    const loadEmails = useCallback(async () => {
        setLoadError('');
        setSyncError('');

        const cacheParams = { activeTab, labelFilter, searchFilter };
        const cachedEmails = readEmailListCache(cacheParams);
        if (cachedEmails) {
            setEmails(cachedEmails);
            setHasCache(true);
        } else {
            setHasCache(false);
        }

        const fetchPromise = fetchEmailList({ silent: Boolean(cachedEmails?.length) });
        const syncPromise = runMailboxSync({ silent: Boolean(cachedEmails?.length) });

        await Promise.all([fetchPromise, syncPromise]);
    }, [activeTab, labelFilter, searchFilter, fetchEmailList, runMailboxSync]);

    const showSyncNotice = useCallback((message) => {
        setSyncNotice(message);
        if (syncNoticeTimer.current) {
            clearTimeout(syncNoticeTimer.current);
        }
        syncNoticeTimer.current = setTimeout(() => {
            setSyncNotice('');
        }, 4000);
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

        const actionError = consumeActionError();
        if (actionError) {
            setSyncError(actionError);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, labelFilter, searchFilter, starredEmail, page]);

    useEffect(() => {
        if (searchFilter || !SYNC_TYPES.has(activeTab)) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            syncInBackground();
        }, BACKGROUND_SYNC_MS);

        return () => clearInterval(intervalId);
    }, [activeTab, searchFilter, syncInBackground]);

    useEffect(() => () => {
        if (syncNoticeTimer.current) {
            clearTimeout(syncNoticeTimer.current);
        }
    }, []);

    useEffect(() => {
        setSelectedEmails([]);
        setPage(1);
    }, [activeTab, labelFilter, searchFilter]);

    const showBlockingLoader = (isFetching || isSyncing) && emails.length === 0 && !hasCache;
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
        setConfirmDeleteOpen(true);
    };

    const moveSelectedToLabel = (labelSlug, ids, error) => {
        if (error) {
            setSyncError(error);
            return;
        }

        const idSet = new Set(ids);
        const cacheParams = { activeTab, labelFilter, searchFilter };
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
        showSyncNotice(`Moved to ${getLabelDisplayName(labelSlug, labelNameMap)}`);
    };

    const deleteSelectedEmails = () => {
        if (!selectedEmails.length) {
            return;
        }

        const idsToRemove = [...selectedEmails];
        const isPermanentDelete = type === 'bin';
        const cacheParams = { activeTab, labelFilter, searchFilter };
        const previousEmails = emails;
        const previousTotal = totalEmails;
        const nextEmails = previousEmails.filter((email) => !idsToRemove.includes(email._id));

        setConfirmDeleteOpen(false);
        setSelectedEmails([]);
        setEmails(nextEmails);
        setTotalEmails(Math.max(0, previousTotal - idsToRemove.length));
        removeEmailsFromListCache(idsToRemove);
        writeEmailListCache(cacheParams, nextEmails);

        const apiCall = isPermanentDelete
            ? deleteEmailsService.call(idsToRemove)
            : moveEmailsToBin.call(idsToRemove);

        apiCall.then((result) => {
            if (result.error) {
                setEmails(previousEmails);
                setTotalEmails(previousTotal);
                writeEmailListCache(cacheParams, previousEmails);
                setSyncError(result.error);
            }
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
                    {hasSelection && type !== 'bin' && availableLabels.length > 0 && (
                        <MoveToLabelMenu
                            emailIds={selectedEmails}
                            labels={availableLabels}
                            onMoved={moveSelectedToLabel}
                        />
                    )}
                    {hasSelection && (
                        <IconButton label="Delete" onClick={requestDeleteSelectedEmails}>
                            <Trash2 className="h-4 w-4" />
                        </IconButton>
                    )}
                    <div className="ml-auto min-w-0 text-right">
                        <p className="truncate text-sm font-medium text-slate-800">
                            {searchFilter ? `Search: ${searchFilter}` : tabTitles[activeTab] || 'Mail'}
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
                        {emails.map((email) => (
                            <Email
                                email={email}
                                key={email._id || email.messageId}
                                setStarredEmail={setStarredEmail}
                                selectedEmails={selectedEmails}
                                setSelectedEmails={setSelectedEmails}
                                labelNameMap={labelNameMap}
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
                        : EMPTY_TABS[activeTab]} />
                )}
            </div>

            {emails.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                    <span>{totalEmails} messages · page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                            Newer
                        </Button>
                        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                            Older
                        </Button>
                    </div>
                </div>
            )}

            {searchFilter && (
                <div className="border-t border-slate-100 px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`${routes.emails.path}/inbox`)}>
                        Clear search
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={confirmDeleteOpen}
                title={type === 'bin' ? 'Delete forever?' : 'Move to Bin?'}
                message={type === 'bin'
                    ? `Permanently delete ${selectedEmails.length} selected message${selectedEmails.length === 1 ? '' : 's'}? This cannot be undone.`
                    : `Move ${selectedEmails.length} selected message${selectedEmails.length === 1 ? '' : 's'} to Bin?`}
                confirmLabel={type === 'bin' ? 'Delete forever' : 'Move to Bin'}
                onConfirm={deleteSelectedEmails}
                onCancel={() => setConfirmDeleteOpen(false)}
            />
        </div>
    );
};

export default Emails;
