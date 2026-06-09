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
import { readEmailListCache, writeEmailListCache } from '../utils/emailListCache';
import ConfirmDialog from './common/ConfirmDialog';

const SYNC_TYPES = new Set(['allmail', 'inbox', 'starred', 'bin']);

const Emails = () => {
    const [starredEmail, setStarredEmail] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [emails, setEmails] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasCache, setHasCache] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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

    const activeTab = EMPTY_TABS[type] ? type : 'inbox';
    const labelFilter = searchParams.get('label') || '';
    const searchFilter = searchParams.get('search') || '';

    const fetchEmailList = useCallback(async ({ silent = false } = {}) => {
        const cacheParams = { activeTab, labelFilter, searchFilter };
        if (!silent) {
            setIsFetching(true);
        }

        let fetchResult;
        if (searchFilter) {
            fetchResult = await searchEmailsService.call({ q: searchFilter }, '', { silent: true });
        } else {
            const query = labelFilter ? { label: labelFilter } : {};
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

        const nextEmails = Array.isArray(fetchResult.data) ? fetchResult.data : [];
        setEmails(nextEmails);
        setLoadError('');
        writeEmailListCache(cacheParams, nextEmails);
        setHasCache(true);
        return true;
    }, [activeTab, labelFilter, searchFilter, emails.length, getEmailsService, hasCache, searchEmailsService]);

    const syncInBackground = useCallback(async () => {
        if (searchFilter || !SYNC_TYPES.has(activeTab)) {
            return;
        }

        const requestId = ++syncRequestId.current;
        setIsSyncing(true);

        const syncResult = await syncMailboxService.call({}, '', { silent: true });

        if (requestId !== syncRequestId.current) {
            return;
        }

        setIsSyncing(false);

        if (syncResult.error) {
            if (!hasCache && emails.length === 0) {
                setLoadError(syncResult.error);
            }
            return;
        }

        await fetchEmailList({ silent: true });
    }, [activeTab, emails.length, fetchEmailList, hasCache, searchFilter, syncMailboxService]);

    const loadEmails = useCallback(async () => {
        setLoadError('');

        const cacheParams = { activeTab, labelFilter, searchFilter };
        const cachedEmails = readEmailListCache(cacheParams);
        if (cachedEmails) {
            setEmails(cachedEmails);
            setHasCache(true);
        } else {
            setHasCache(false);
        }

        const fetchPromise = fetchEmailList({ silent: Boolean(cachedEmails?.length) });
        const syncPromise = syncInBackground();

        await Promise.all([fetchPromise, syncPromise]);
    }, [activeTab, labelFilter, searchFilter, fetchEmailList, syncInBackground]);

    useEffect(() => {
        loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, labelFilter, searchFilter, starredEmail]);

    useEffect(() => {
        setSelectedEmails([]);
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

        if (type === 'bin') {
            await deleteEmailsService.call(selectedEmails);
        } else {
            await moveEmailsToBin.call(selectedEmails);
        }

        setConfirmDeleteOpen(false);
        setSelectedEmails([]);
        setStarredEmail((prevState) => !prevState);
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
                    onClick={loadEmails}
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
