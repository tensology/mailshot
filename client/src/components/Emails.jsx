import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { routes } from '../routes/routes';
import { Box, List, Checkbox, CircularProgress, Typography, Button, LinearProgress, IconButton } from '@mui/material';
import Email from './Email';
import { DeleteOutline, ArchiveOutlined, Refresh } from '@mui/icons-material';
import NoMails from './common/NoMails';
import { EMPTY_TABS } from '../constants/constant';
import {
    readEmailListCache,
    writeEmailListCache,
    removeEmailsFromListCache,
    clearEmailListCache
} from '../utils/emailListCache';
import ConfirmDialog from './common/ConfirmDialog';

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

    const { openDrawer } = useOutletContext();
    const { type } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const getEmailsService = useApi(API_URLS.getEmailFromType);
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

    const deleteSelectedEmails = async () => {
        if (!selectedEmails.length) {
            return;
        }

        const idsToRemove = [...selectedEmails];
        const cacheParams = { activeTab, labelFilter, searchFilter };
        const isPermanentDelete = type === 'bin';

        setEmails((current) => current.filter((email) => !idsToRemove.includes(email._id)));
        setTotalEmails((current) => Math.max(0, current - idsToRemove.length));
        removeEmailsFromListCache(idsToRemove);
        setConfirmDeleteOpen(false);
        setSelectedEmails([]);

        const result = isPermanentDelete
            ? await deleteEmailsService.call(idsToRemove)
            : await moveEmailsToBin.call(idsToRemove);

        if (result.error) {
            setLoadError(result.error);
            await fetchEmailList(); // Re-fetch with silent: false to show errors
            return;
        }

        if (!isPermanentDelete) {
            clearEmailListCache(); // Clear all caches to ensure bin updates
        }
        await fetchEmailList(); // Re-fetch with silent: false to update current view
    };

    return (
        <Box style={openDrawer ? { marginLeft: 250, width: '100%' } : { width: '100%' }}>
            {isSyncing && emails.length > 0 && (
                <LinearProgress sx={{ height: 2 }} />
            )}

            <Box sx={{ padding: '12px 10px 0 10px', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Checkbox
                    size="small"
                    onChange={selectAllEmails}
                    checked={allSelected}
                    indeterminate={someSelected}
                />
                <IconButton
                    size="small"
                    onClick={refreshMailbox}
                    disabled={isRefreshing}
                    title="Refresh"
                    aria-label="Refresh"
                >
                    <Refresh
                        fontSize="small"
                        sx={{
                            animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                            '@keyframes spin': {
                                '0%': { transform: 'rotate(0deg)' },
                                '100%': { transform: 'rotate(360deg)' }
                            }
                        }}
                    />
                </IconButton>
                {hasSelection && type !== 'bin' && (
                    <IconButton size="small" onClick={archiveSelectedEmails} title="Archive" aria-label="Archive">
                        <ArchiveOutlined fontSize="small" />
                    </IconButton>
                )}
                {hasSelection && (
                    <IconButton size="small" onClick={requestDeleteSelectedEmails} title="Delete" aria-label="Delete">
                        <DeleteOutline fontSize="small" />
                    </IconButton>
                )}
                {isSyncing && emails.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        Checking for new mail...
                    </Typography>
                )}
                {!isSyncing && syncNotice && (
                    <Typography variant="caption" color="success.main" sx={{ ml: 1 }}>
                        {syncNotice}
                    </Typography>
                )}
                {!isSyncing && !syncNotice && syncError && (
                    <Typography variant="caption" color="error" sx={{ ml: 1, maxWidth: 520 }}>
                        {syncError}
                    </Typography>
                )}
            </Box>

            {showBlockingLoader && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 6 }}>
                    <CircularProgress size={28} />
                    <Typography color="text.secondary">Loading messages...</Typography>
                </Box>
            )}

            {emails.length > 0 && (
                <List sx={{ py: 0, opacity: isFetching && !isSyncing ? 0.85 : 1, transition: 'opacity 0.15s' }}>
                    {emails.map((email) => (
                        <Email
                            email={email}
                            key={email._id || email.messageId}
                            setStarredEmail={setStarredEmail}
                            selectedEmails={selectedEmails}
                            setSelectedEmails={setSelectedEmails}
                        />
                    ))}
                </List>
            )}

            {!showBlockingLoader && loadError && emails.length === 0 && (
                <Box style={{ padding: 30 }}>
                    <NoMails message={{ heading: 'Could not load messages', subHeading: loadError }} />
                </Box>
            )}

            {!showBlockingLoader && !loadError && emails.length === 0 && (
                <NoMails message={searchFilter
                    ? { heading: 'No messages found', subHeading: `No results for "${searchFilter}"` }
                    : EMPTY_TABS[activeTab]} />
            )}

            {emails.length > 0 && totalPages > 1 && (
                <Box sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">
                        {totalEmails} messages · page {page} of {totalPages}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                            Newer
                        </Button>
                        <Button size="small" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                            Older
                        </Button>
                    </Box>
                </Box>
            )}

            {searchFilter && (
                <Box sx={{ px: 2, py: 1 }}>
                    <Button size="small" onClick={() => navigate(`${routes.emails.path}/inbox`)}>Clear search</Button>
                </Box>
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
        </Box>
    );
};

export default Emails;
