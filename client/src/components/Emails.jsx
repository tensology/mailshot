import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Archive, OctagonAlert, RefreshCw, Search, Trash2, X } from 'lucide-react';
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
    consumeActionNotice,
    requestMailboxCountsRefresh,
    restoreEmailsToListCache,
    emitEmailsRestored
} from '../utils/emailListCache';
import ConfirmDialog from './common/ConfirmDialog';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Spinner from './ui/Spinner';
import MoveToLabelMenu from './MoveToLabelMenu';
import Toast from './ui/Toast';
import { buildLabelNameMap, getLabelDisplayName } from '../utils/labels';
import { useCompose } from '../context/ComposeContext';
import { parseSenderName } from '../utils/emailFormatter';
import { useReadSummary } from '../context/ReadSummaryContext';
import { useAuth } from '../context/AuthContext';
import { useUndoDelete } from '../context/UndoDeleteContext';
import { getDeleteSelectionIds, hasActiveMailSelection } from '../utils/mailActions';

const SYNC_TYPES = new Set(['allmail', 'inbox', 'starred', 'bin']);
const PAGE_SIZE = 50;
const BACKGROUND_SYNC_MS = 60000;

const getEmailSelectionIds = (email) => (
    Array.isArray(email.thread_ids) && email.thread_ids.length > 0
        ? email.thread_ids
        : [email._id]
);

const emailMatchesRemoval = (email, idsToRemove) => {
    const threadIds = getEmailSelectionIds(email);
    return threadIds.some((id) => idsToRemove.includes(id));
};

const getListSenderName = (email, activeTab) => {
    const isDraft = activeTab === 'drafts' || email.type === 'drafts';
    if (isDraft) {
        return email.to ? parseSenderName(email.to) : '(no recipient)';
    }
    if (email.type === 'sent') {
        return parseSenderName(email.to);
    }
    return parseSenderName(email.from);
};

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
    spam: 'Spam',
    allmail: 'All Mail',
    archived: 'Archived'
};

const buildEmptyMessage = ({ searchFilter, participantFilter, labelFilter, listTitle, activeTab }) => {
    if (searchFilter) {
        return { heading: 'No messages found', subHeading: `No results for "${searchFilter}"` };
    }

    if (participantFilter) {
        return { heading: `No mail with ${participantFilter}`, subHeading: `No messages involving ${participantFilter}.` };
    }

    if (labelFilter) {
        return { heading: `No mail in ${listTitle}`, subHeading: `No messages are currently in the ${listTitle} label.` };
    }

    return {
        heading: `No mail in ${listTitle}`,
        subHeading: EMPTY_TABS[activeTab]?.subHeading || `No messages are currently in ${listTitle}.`
    };
};

const Emails = () => {
    const { type } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = EMPTY_TABS[type] ? type : 'inbox';
    const { openComposeDraft } = useCompose();
    const {
        enabled: readSummaryEnabled,
        pendingEmailId: readSummaryPendingEmailId,
        startReadSummary
    } = useReadSummary();
    const { isSuperuser } = useAuth();
    const { showUndoDelete } = useUndoDelete();
    const labelFilter = searchParams.get('label') || '';
    const searchFilter = searchParams.get('search') || '';
    const participantFilter = searchParams.get('participant') || '';
    const unreadFilter = searchParams.get('unread') === 'true';
    const [page, setPage] = useState(1);
    const listCacheParams = { activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, page };

    const [starredEmail, setStarredEmail] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [allMatchingSelected, setAllMatchingSelected] = useState(false);
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
    const [searchInput, setSearchInput] = useState(searchFilter);

    const [labelNameMap, setLabelNameMap] = useState(new Map());
    const [availableLabels, setAvailableLabels] = useState([]);

    const getEmailsService = useApi(API_URLS.getEmailFromType);
    const getLabelsService = useApi(API_URLS.getLabels);
    const syncMailboxService = useApi(API_URLS.syncMailbox);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const restoreEmailsFromBin = useApi(API_URLS.restoreEmailsFromBin);
    const archiveEmailsService = useApi(API_URLS.archiveEmails);
    const markSpamEmailsService = useApi(API_URLS.markSpamEmails);
    const startSummarizeAllService = useApi(API_URLS.startSummarizeAll);
    const getSummarizeAllStatusService = useApi(API_URLS.getSummarizeAllStatus);

    const [summarizeAllActive, setSummarizeAllActive] = useState(false);
    const [summarizeProgress, setSummarizeProgress] = useState({ total: 0, processed: 0, failed: 0 });

    const syncRequestId = useRef(0);
    const listRequestId = useRef(0);
    const syncNoticeTimer = useRef(null);
    const selectionAnchorIndex = useRef(null);
    const pendingFocusPosition = useRef(null);
    const pendingFocusEmailId = useRef(null);

    const focusEmailRow = (emailId) => {
        window.requestAnimationFrame(() => {
            const escapedId = window.CSS?.escape ? window.CSS.escape(emailId) : String(emailId).replace(/"/g, '\\"');
            document.querySelector(`[data-email-row-id="${escapedId}"]`)?.focus();
        });
    };

    const fetchEmailList = useCallback(async ({ silent = false, pageOverride, requestId } = {}) => {
        const activeRequestId = requestId ?? ++listRequestId.current;
        const listPage = pageOverride ?? page;
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, page: listPage };
        if (!silent) {
            setIsFetching(true);
        }

        const query = {
            page: listPage,
            limit: PAGE_SIZE,
            ...(labelFilter ? { label: labelFilter } : {}),
            ...(searchFilter ? { search: searchFilter } : {}),
            ...(participantFilter ? { participant: participantFilter } : {}),
            ...(unreadFilter ? { unread: 'true' } : {})
        };
        const fetchResult = await getEmailsService.call(query, activeTab, { silent: true });

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
    }, [activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, getEmailsService, page]);

    const runMailboxSync = useCallback(async ({ silent = true, listPage, listRequestId: listRequestIdOverride } = {}) => {
        if (searchFilter || participantFilter || unreadFilter || !SYNC_TYPES.has(activeTab)) {
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
    }, [activeTab, emails.length, fetchEmailList, hasCache, participantFilter, searchFilter, syncMailboxService, unreadFilter]);

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
    }, [activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, fetchEmailList, runMailboxSync]);

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

    const offerBinUndo = useCallback(({
        count,
        ids,
        restoredEmails = [],
        previousEmails,
        previousTotal,
        previousPage,
        cacheParams,
        bulkPayload = null
    }) => {
        const message = count === 1 ? 'Message moved to Bin' : `${count} messages moved to Bin`;

        showUndoDelete({
            message,
            restore: async () => {
                const result = bulkPayload
                    ? await restoreEmailsFromBin.call(bulkPayload)
                    : await restoreEmailsFromBin.call(ids);

                if (result.error) {
                    showActionToast(result.error, 'error');
                    throw new Error(result.error);
                }

                if (bulkPayload) {
                    setPage(previousPage || 1);
                    await fetchEmailList({ silent: true, pageOverride: previousPage || 1 });
                } else {
                    setEmails(previousEmails);
                    setTotalEmails(previousTotal);
                    setPage(previousPage);
                    writeEmailListCache(cacheParams, previousEmails);
                    restoreEmailsToListCache(restoredEmails);
                }

                requestMailboxCountsRefresh();
                showActionToast(count === 1 ? 'Message restored' : `${count} messages restored`);
            }
        });
    }, [fetchEmailList, restoreEmailsFromBin, showActionToast, showUndoDelete]);

    useEffect(() => {
        const onEmailsRestored = (event) => {
            const restored = Array.isArray(event.detail?.emails) ? event.detail.emails : [];
            if (!restored.length || activeTab !== 'inbox') {
                return;
            }

            setEmails((current) => {
                const restoredIds = new Set(restored.map((email) => email._id));
                const kept = current.filter((email) => !restoredIds.has(email._id));
                const merged = [...restored, ...kept].sort((left, right) => new Date(right.date) - new Date(left.date));
                writeEmailListCache(listCacheParams, merged);
                return merged;
            });
            setTotalEmails((count) => Math.max(count, restored.length));
        };

        window.addEventListener('mailshot:emails-restored', onEmailsRestored);
        return () => window.removeEventListener('mailshot:emails-restored', onEmailsRestored);
    }, [activeTab, listCacheParams]);

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
        if (activeTab !== 'drafts') {
            return undefined;
        }

        const onDraftSaved = () => {
            fetchEmailList({ silent: true });
        };

        window.addEventListener('mailshot:draft-saved', onDraftSaved);
        return () => window.removeEventListener('mailshot:draft-saved', onDraftSaved);
    }, [activeTab, fetchEmailList]);

    useEffect(() => {
        loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, starredEmail, page]);

    useEffect(() => {
        if (pendingFocusEmailId.current && emails.length > 0) {
            const nextEmail = emails.find((email) => email._id === pendingFocusEmailId.current);
            pendingFocusEmailId.current = null;
            if (nextEmail?._id) {
                setHighlightedEmail(nextEmail._id);
                focusEmailRow(nextEmail._id);
            }
            return;
        }

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
        if (searchFilter || participantFilter || unreadFilter || !SYNC_TYPES.has(activeTab)) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            syncInBackground();
        }, BACKGROUND_SYNC_MS);

        return () => clearInterval(intervalId);
    }, [activeTab, participantFilter, searchFilter, syncInBackground, unreadFilter]);

    useEffect(() => {
        setSearchInput(searchFilter);
    }, [searchFilter]);

    useEffect(() => () => {
        if (syncNoticeTimer.current) {
            clearTimeout(syncNoticeTimer.current);
        }
    }, []);

    useEffect(() => {
        setSelectedEmails([]);
        setAllMatchingSelected(false);
        setHighlightedEmail('');
        setDeleteTargetIds([]);
        setPage(1);
        setTotalEmails(0);
        setTotalPages(1);
    }, [activeTab, labelFilter, searchFilter, participantFilter, unreadFilter]);

    const listTitle = searchFilter
        ? `Search: ${searchFilter}`
        : participantFilter
            ? `Mail with ${participantFilter}`
            : labelFilter
                ? getLabelDisplayName(labelFilter, labelNameMap)
                : tabTitles[activeTab] || 'Mail';
    const selectionScopeLabel = searchFilter
        ? `this search`
        : labelFilter
            ? `the ${listTitle} label`
            : listTitle;

    const updateListSearchParams = (updates = {}) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '' || value === false) {
                next.delete(key);
                return;
            }
            next.set(key, String(value));
        });
        setPage(1);
        setSearchParams(next);
    };

    const submitSearch = (event) => {
        event.preventDefault();
        updateListSearchParams({ search: searchInput.trim() });
    };

    const clearSearch = () => {
        setSearchInput('');
        updateListSearchParams({ search: '' });
    };

    const toggleUnreadFilter = () => {
        updateListSearchParams({ unread: unreadFilter ? '' : 'true' });
    };

    const handleSummarizeAll = async () => {
        const result = await startSummarizeAllService.call({});
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        const status = result.data || {};
        setSummarizeProgress(status);
        setSummarizeAllActive(Boolean(status.active || status.queued > 0));
        setSnackbar({
            open: true,
            message: status.queued > 0
                ? `Queued ${status.queued} emails for summary and speech`
                : 'All inbox emails are already summarized',
            severity: 'success'
        });
    };

    useEffect(() => {
        if (!summarizeAllActive || !readSummaryEnabled) {
            return undefined;
        }

        const interval = window.setInterval(async () => {
            const result = await getSummarizeAllStatusService.call({}, '', { silent: true });
            if (result.error) {
                return;
            }

            const status = result.data || {};
            setSummarizeProgress(status);
            fetchEmailList({ silent: true });

            if (!status.active) {
                setSummarizeAllActive(false);
                setSnackbar({
                    open: true,
                    message: status.failed > 0
                        ? `Summarize all finished with ${status.failed} failures`
                        : 'Summarize all finished',
                    severity: status.failed > 0 ? 'error' : 'success'
                });
            }
        }, 4000);

        return () => window.clearInterval(interval);
    }, [summarizeAllActive, readSummaryEnabled, fetchEmailList, getSummarizeAllStatusService]);

    const showBlockingLoader = emails.length === 0 && (isFetching || isSyncing);
    const pageSelectionIds = emails.flatMap(getEmailSelectionIds);
    const hasSelection = hasActiveMailSelection({ selectedEmails, allMatchingSelected });
    const allSelected = allMatchingSelected || (pageSelectionIds.length > 0 && pageSelectionIds.every((id) => selectedEmails.includes(id)));
    const someSelected = !allMatchingSelected && pageSelectionIds.some((id) => selectedEmails.includes(id)) && !allSelected;
    const selectionCount = allMatchingSelected ? totalEmails : selectedEmails.length;
    const canSelectAllMatching = allSelected && !allMatchingSelected && totalEmails > emails.length;
    const isRefreshing = isFetching || isSyncing;
    const senderColumnWidthCh = Math.max(
        14,
        ...emails.map((email) => getListSenderName(email, activeTab).length)
    ) + 1;

    const selectAllEmails = (event) => {
        if (event.target.checked) {
            setSelectedEmails(emails.flatMap(getEmailSelectionIds));
        } else {
            setSelectedEmails([]);
            setAllMatchingSelected(false);
        }
        selectionAnchorIndex.current = null;
    };

    const selectRangeFromAnchor = (toIndex) => {
        setAllMatchingSelected(false);
        const fromIndex = selectionAnchorIndex.current ?? toIndex;
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const rangeIds = emails.slice(start, end + 1).flatMap(getEmailSelectionIds);
        setSelectedEmails((current) => [...new Set([...current, ...rangeIds])]);
    };

    const handleRowSelect = (email, index, event) => {
        setHighlightedEmail(email._id);
    };

    const handleCheckboxSelect = (email, index, event) => {
        if (allMatchingSelected) {
            const threadIds = getEmailSelectionIds(email);
            setAllMatchingSelected(false);
            setSelectedEmails(pageSelectionIds.filter((id) => !threadIds.includes(id)));
            selectionAnchorIndex.current = index;
            return;
        }

        setAllMatchingSelected(false);
        if (event.shiftKey) {
            selectRangeFromAnchor(index);
            return;
        }

        const threadIds = getEmailSelectionIds(email);
        const allSelected = threadIds.every((id) => selectedEmails.includes(id));

        setSelectedEmails((current) => (
            allSelected
                ? current.filter((id) => !threadIds.includes(id))
                : [...new Set([...current, ...threadIds])]
        ));
        selectionAnchorIndex.current = index;
    };

    const handleKeyboardDelete = (email) => {
        setAllMatchingSelected(false);
        setDeleteTargetIds(getEmailSelectionIds(email));
        setConfirmDeleteOpen(true);
    };

    const buildBulkScope = () => ({
        all: true,
        type: activeTab,
        label: labelFilter,
        search: searchFilter,
        participant: participantFilter,
        unread: unreadFilter
    });

    const getBulkPayload = () => (
        allMatchingSelected
            ? { scope: buildBulkScope() }
            : selectedEmails
    );

    const clearBulkSelection = () => {
        setSelectedEmails([]);
        setAllMatchingSelected(false);
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

    const handleReadSummary = async (email) => {
        const result = await startReadSummary(email?._id, {
            audioReady: email?.read_aloud_status === 'ready',
            summaryPreview: email?.read_summary_status === 'ready' ? email?.read_summary : ''
        });
        if (result.error) {
            showActionToast(result.error, 'error');
        }
    };

    const openDraftEmail = (email) => {
        openComposeDraft({
            _id: email._id,
            to: email.to || '',
            cc: email.cc || '',
            bcc: email.bcc || '',
            subject: email.subject || '',
            body: email.body || '',
            in_reply_to: email.in_reply_to || '',
            references: Array.isArray(email.references) ? email.references : [],
            show_cc: Boolean(email.cc),
            show_bcc: Boolean(email.bcc),
            title: email.subject ? `Draft: ${email.subject}` : 'Draft'
        });
    };

    const archiveSelectedEmails = async () => {
        if (!hasSelection) {
            return;
        }
        const result = await archiveEmailsService.call(getBulkPayload());
        if (result.error) {
            showActionToast(result.error, 'error');
            return;
        }
        const count = Number(result.data?.count) || selectionCount;
        clearBulkSelection();
        clearEmailListCache();
        setStarredEmail((prevState) => !prevState);
        requestMailboxCountsRefresh();
        showActionToast(`${count} message${count === 1 ? '' : 's'} archived`);
    };

    const requestDeleteSelectedEmails = () => {
        if (!hasSelection) {
            return;
        }
        setDeleteTargetIds(allMatchingSelected ? [] : [...selectedEmails]);
        setConfirmDeleteOpen(true);
    };

    const markSelectedAsSpam = async () => {
        if (!hasSelection) {
            return;
        }

        if (allMatchingSelected) {
            const count = selectionCount;
            const result = await markSpamEmailsService.call(getBulkPayload());
            if (result.error) {
                showActionToast(result.error, 'error');
                return;
            }
            clearBulkSelection();
            clearEmailListCache();
            setEmails([]);
            setTotalEmails(0);
            setTotalPages(1);
            setPage(1);
            requestMailboxCountsRefresh();
            showActionToast(`${Number(result.data?.count) || count} messages marked as spam`);
            return;
        }

        const idsToRemove = [...selectedEmails];
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, page };
        const previousEmails = emails;
        const previousTotal = totalEmails;
        const removedRows = previousEmails.filter((email) => emailMatchesRemoval(email, idsToRemove));
        const nextEmails = previousEmails.filter((email) => !emailMatchesRemoval(email, idsToRemove));

        setSelectedEmails([]);
        setEmails(nextEmails);
        setTotalEmails(Math.max(0, previousTotal - removedRows.length));
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

        requestMailboxCountsRefresh();
        showActionToast(`${idsToRemove.length} message${idsToRemove.length === 1 ? '' : 's'} marked as spam`);
    };

    const moveSelectedToLabel = (labelSlug, ids, error, affectedCount) => {
        if (error) {
            setSyncError(error);
            return;
        }

        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, page };
        const previousEmails = emails;
        const shouldRemoveFromView = activeTab === 'inbox' || activeTab === 'bin' || labelFilter;

        if (!shouldRemoveFromView) {
            clearBulkSelection();
            return;
        }

        if (allMatchingSelected) {
            clearBulkSelection();
            clearEmailListCache();
            setEmails([]);
            setTotalEmails(0);
            setTotalPages(1);
            setPage(1);
            requestMailboxCountsRefresh();
            return;
        }

        const nextEmails = previousEmails.filter((email) => !emailMatchesRemoval(email, ids));
        const removedRows = previousEmails.length - nextEmails.length;
        setEmails(nextEmails);
        setTotalEmails(Math.max(0, totalEmails - (affectedCount || removedRows)));
        clearBulkSelection();
        removeEmailsFromListCache(ids);
        writeEmailListCache(cacheParams, nextEmails);
    };

    const confirmMoveToLabel = (labelSlug, ids, affectedCount) => {
        const labelName = getLabelDisplayName(labelSlug, labelNameMap);
        const count = Number(affectedCount) || ids.length;
        const message = count === 1
            ? `Moved to ${labelName}`
            : `${count} messages moved to ${labelName}`;
        showActionToast(message);
    };

    const deleteSelectedEmails = () => {
        const idsForDelete = getDeleteSelectionIds({ deleteTargetIds, selectedEmails, allMatchingSelected });

        if (!idsForDelete.length && !allMatchingSelected) {
            return;
        }

        if (allMatchingSelected && !deleteTargetIds.length) {
            const count = selectionCount;
            const isPermanentDelete = type === 'bin';
            const payload = getBulkPayload();
            setConfirmDeleteOpen(false);
            setDeleteTargetIds([]);
            clearBulkSelection();
            clearEmailListCache();
            setEmails([]);
            setHighlightedEmail('');
            setTotalEmails(0);
            setTotalPages(1);
            setPage(1);

            const apiCall = isPermanentDelete
                ? deleteEmailsService.call(payload)
                : moveEmailsToBin.call(payload);

            apiCall.then((result) => {
                if (result.error) {
                    showActionToast(result.error, 'error');
                    setStarredEmail((prevState) => !prevState);
                    return;
                }

                const affectedCount = Number(result.data?.count) || count;
                requestMailboxCountsRefresh();
                if (isPermanentDelete) {
                    showActionToast(`${affectedCount} message${affectedCount === 1 ? '' : 's'} deleted permanently`);
                    return;
                }

                offerBinUndo({
                    count: affectedCount,
                    ids: [],
                    bulkPayload: payload,
                    previousPage: 1
                });
            });
            return;
        }

        const idsToRemove = [...idsForDelete];
        const isPermanentDelete = type === 'bin';
        const cacheParams = { activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, page };
        const previousEmails = emails;
        const previousTotal = totalEmails;
        const previousPage = page;
        const removedRows = previousEmails.filter((email) => emailMatchesRemoval(email, idsToRemove));
        const nextEmails = previousEmails.filter((email) => !emailMatchesRemoval(email, idsToRemove));
        const firstRemovedIndex = previousEmails.findIndex((email) => emailMatchesRemoval(email, idsToRemove));
        const nextFocusEmail = firstRemovedIndex >= 0
            ? nextEmails[Math.min(firstRemovedIndex, Math.max(0, nextEmails.length - 1))]
            : null;
        const nextTotal = Math.max(0, previousTotal - removedRows.length);
        const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        const nextPage = Math.min(page, nextTotalPages);
        const nextCacheParams = { activeTab, labelFilter, searchFilter, participantFilter, unreadFilter, page: nextPage };

        setConfirmDeleteOpen(false);
        setDeleteTargetIds([]);
        clearBulkSelection();
        setEmails(nextEmails);
        if (nextPage === page && nextFocusEmail?._id) {
            pendingFocusEmailId.current = nextFocusEmail._id;
        } else if (nextPage < page) {
            pendingFocusPosition.current = 'last';
        } else {
            setHighlightedEmail('');
        }
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
            requestMailboxCountsRefresh();
            if (isPermanentDelete) {
                showActionToast(`${count} message${count === 1 ? '' : 's'} deleted permanently`);
                return;
            }

            offerBinUndo({
                count,
                ids: idsToRemove,
                restoredEmails: removedRows,
                previousEmails,
                previousTotal,
                previousPage,
                cacheParams
            });
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            {isSyncing && emails.length > 0 && (
                <div className="h-0.5 w-full overflow-hidden bg-slate-100">
                    <div className="h-full w-1/3 animate-pulse bg-blue-500" />
                </div>
            )}

            <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/70 px-3 py-2.5 shadow-sm backdrop-blur sm:px-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            aria-label="Select all messages"
                            ref={(input) => {
                                if (input) {
                                    input.indeterminate = someSelected;
                                }
                            }}
                            onChange={selectAllEmails}
                            className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500"
                        />
                        <span className="inline-flex max-w-full items-center rounded-full border border-blue-100 bg-white px-3 py-1 text-sm font-semibold text-blue-800 shadow-sm">
                            <span className="truncate">{listTitle}</span>
                        </span>
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
                        {hasSelection && type !== 'spam' && availableLabels.length > 0 && (
                            <MoveToLabelMenu
                                emailIds={selectedEmails}
                                selectionPayload={allMatchingSelected ? { scope: buildBulkScope() } : null}
                                selectionCount={selectionCount}
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
                        {canSelectAllMatching && (
                            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs text-blue-800">
                                <span>
                                    All {emails.length} on this page selected.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAllMatchingSelected(true)}
                                    className="font-semibold underline-offset-2 hover:underline"
                                >
                                    Select all {totalEmails} in {selectionScopeLabel}
                                </button>
                            </div>
                        )}
                        {allMatchingSelected && (
                            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-200 bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm">
                                <span>All {totalEmails} in {selectionScopeLabel} selected.</span>
                                <button
                                    type="button"
                                    onClick={clearBulkSelection}
                                    className="font-semibold underline-offset-2 hover:underline"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                            {isSyncing && emails.length > 0 && (
                                <span className="text-slate-500">Checking for new mail…</span>
                            )}
                            {!isSyncing && syncNotice && (
                                <span className="font-medium text-emerald-600">{syncNotice}</span>
                            )}
                            {!isSyncing && !syncNotice && syncError && (
                                <span className="text-red-600">{syncError}</span>
                            )}
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
                        {readSummaryEnabled && isSuperuser && activeTab === 'inbox' && (
                            <button
                                type="button"
                                onClick={handleSummarizeAll}
                                disabled={summarizeAllActive || startSummarizeAllService.isLoading}
                                className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
                                    summarizeAllActive
                                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:text-emerald-700'
                                }`}
                            >
                                {summarizeAllActive
                                    ? `Summarizing ${summarizeProgress.processed}/${summarizeProgress.total}`
                                    : 'Summarize all'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={toggleUnreadFilter}
                            aria-pressed={unreadFilter}
                            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3 text-sm font-semibold transition ${
                                unreadFilter
                                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
                            }`}
                        >
                            Unread only
                        </button>
                        <form
                            onSubmit={submitSearch}
                            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 sm:min-w-[18rem] lg:w-80"
                        >
                            <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            <input
                                type="search"
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                placeholder={`Search ${labelFilter ? 'label' : 'mail'}`}
                                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                            />
                            {searchFilter && (
                                <button
                                    type="button"
                                    onClick={clearSearch}
                                    aria-label="Clear search"
                                    className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </form>
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
                                checkedEmails={allMatchingSelected ? pageSelectionIds : selectedEmails}
                                highlightedEmail={highlightedEmail}
                                labelNameMap={labelNameMap}
                                senderColumnWidthCh={senderColumnWidthCh}
                                rowTone={index % 2 === 1 ? 'muted' : 'plain'}
                                readSummaryEnabled={readSummaryEnabled}
                                readSummaryLoading={readSummaryPendingEmailId === email._id}
                                onReadSummary={handleReadSummary}
                                onRowSelect={handleRowSelect}
                                onCheckboxSelect={handleCheckboxSelect}
                                onKeyboardDelete={handleKeyboardDelete}
                                onKeyboardNavigate={handleKeyboardNavigate}
                                onOpenDraft={openDraftEmail}
                                deleteDialogOpen={confirmDeleteOpen}
                            />
                        ))}
                    </div>
                )}

                {!showBlockingLoader && loadError && emails.length === 0 && (
                    <NoMails message={{ heading: 'Could not load messages', subHeading: loadError }} />
                )}

                {!showBlockingLoader && !loadError && emails.length === 0 && (
                    <NoMails message={buildEmptyMessage({ searchFilter, participantFilter, labelFilter, listTitle, activeTab })} />
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
                        onClick={() => updateListSearchParams(searchFilter ? { search: '' } : { participant: '' })}
                    >
                        {searchFilter ? 'Clear search' : 'Clear filter'}
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={confirmDeleteOpen}
                title={type === 'bin' ? 'Delete forever?' : 'Move to Bin?'}
                message={type === 'bin'
                    ? `Permanently delete ${(deleteTargetIds.length || selectionCount)} selected message${(deleteTargetIds.length || selectionCount) === 1 ? '' : 's'}? This cannot be undone.`
                    : `Move ${(deleteTargetIds.length || selectionCount)} selected message${(deleteTargetIds.length || selectionCount) === 1 ? '' : 's'} to Bin?`}
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
