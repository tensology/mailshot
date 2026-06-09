import { useEffect, useState } from "react";
import { Box, Typography, styled, Button, CircularProgress, Snackbar, Alert, Link, Chip, MenuItem, Select, FormControl, InputLabel } from "@mui/material";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { emptyProfilePic } from "../constants/constant";
import { ArrowBack, Delete } from "@mui/icons-material";
import useApi from "../hooks/useApi";
import { API_URLS } from "../services/api.urls";
import { formatEmailBody } from "../utils/emailFormatter";
import { markEmailReadInCache } from "../utils/emailListCache";
import {
    buildForwardBody,
    buildReplyAllRecipients,
    buildReplyBody,
    buildReplyRecipients
} from "../utils/recipients";
import { useCompose } from "../context/ComposeContext";
import ConfirmDialog from "./common/ConfirmDialog";
import ThreadMessage from "./ThreadMessage";

const API_URL = process.env.REACT_APP_API_URL || '';

const IconWrapper = styled(Box)({
    padding: 15
});

const Subject = styled(Typography)({
    fontSize: 22,
    margin: "10px 0 20px 75px",
    display: "flex",
    alignItems: "center",
    gap: 8
});

const Indicator = styled(Box)({
    fontSize: "12px !important",
    background: "#ddd",
    color: "#222",
    borderRadius: "4px",
    padding: "2px 8px"
});

const ViewEmail = () => {
    const { openDrawer } = useOutletContext();
    const { openComposeDraft } = useCompose();
    const getThreadService = useApi(API_URLS.getEmailThread);
    const getLabelsService = useApi(API_URLS.getLabels);
    const updateEmailLabelsService = useApi(API_URLS.updateEmailLabels);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [labels, setLabels] = useState([]);
    const [emailLabels, setEmailLabels] = useState([]);
    const [thread, setThread] = useState([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
    const [loadError, setLoadError] = useState('');
    const { type, id } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        const loadThread = async () => {
            if (!id) {
                return;
            }

            setLoadError('');
            const result = await getThreadService.call({}, `${id}/thread`);
            if (result.error) {
                setLoadError(result.error);
                setThread([]);
                return;
            }

            const messages = Array.isArray(result.data) ? result.data : [];
            setThread(messages);
            markEmailReadInCache(id);
            messages.forEach((message) => markEmailReadInCache(message._id));
        };

        loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        getLabelsService.call();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (Array.isArray(getLabelsService.response)) {
            setLabels(getLabelsService.response);
        }
    }, [getLabelsService.response]);

    const primaryEmail = thread.find((message) => message._id === id) || thread[thread.length - 1] || null;

    useEffect(() => {
        if (primaryEmail?.labels) {
            setEmailLabels(primaryEmail.labels);
        }
    }, [primaryEmail]);

    if (getThreadService.isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 8, marginLeft: openDrawer ? 250 : 0 }}>
                <CircularProgress size={28} />
                <Typography>Loading message...</Typography>
            </Box>
        );
    }

    if (!primaryEmail || loadError) {
        return (
            <Box style={openDrawer ? { marginLeft: 250, width: "100%", padding: 30 } : { width: "100%", padding: 30 }}>
                <Typography variant="h6">Could not load this message.</Typography>
                {loadError && <Typography style={{ marginTop: 8 }}>{loadError}</Typography>}
                <Button variant="contained" style={{ marginTop: 16 }} onClick={() => navigate(`/emails/${type || 'inbox'}`)}>
                    Back to Inbox
                </Button>
            </Box>
        );
    }

    const subject = primaryEmail?.subject || "(no subject)";

    const openReplyDraft = (message, plainBody, mode) => {
        const replySubject = (message.subject || '').startsWith('Re:')
            ? message.subject
            : `Re: ${message.subject || '(no subject)'}`;
        const references = [...(message.references || []), message.messageId].filter(Boolean);

        if (mode === 'forward') {
            openComposeDraft({
                to: '',
                subject: (message.subject || '').startsWith('Fwd:') ? message.subject : `Fwd: ${message.subject || '(no subject)'}`,
                body: buildForwardBody(message, plainBody),
                title: 'Forward'
            });
            return;
        }

        if (mode === 'reply-all') {
            const { to, cc } = buildReplyAllRecipients(message);
            openComposeDraft({
                to,
                cc,
                show_cc: Boolean(cc),
                subject: replySubject,
                body: buildReplyBody(message, plainBody),
                in_reply_to: message.messageId || '',
                references,
                title: 'Reply all'
            });
            return;
        }

        openComposeDraft({
            to: buildReplyRecipients(message).join(', '),
            subject: replySubject,
            body: buildReplyBody(message, plainBody),
            in_reply_to: message.messageId || '',
            references,
            title: 'Reply'
        });
    };

    const saveLabels = async (nextLabels) => {
        setEmailLabels(nextLabels);
        const result = await updateEmailLabelsService.call({ labels: nextLabels }, `${primaryEmail._id}/labels`);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
        }
    };

    const deleteEmail = async () => {
        const result = type === 'bin'
            ? await deleteEmailsService.call([primaryEmail._id])
            : await moveEmailsToBin.call([primaryEmail._id]);

        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        setConfirmDeleteOpen(false);
        navigate(`/emails/${type || 'inbox'}`);
    };

    return (
        <Box style={openDrawer ? { marginLeft: 250, width: "100%" } : { width: "100%" }}>
            <IconWrapper>
                <ArrowBack fontSize="small" color="action" onClick={() => navigate(`/emails/${type || 'inbox'}`)} />
                <Delete fontSize="small" color="action" style={{ marginLeft: 40, cursor: 'pointer' }} onClick={() => setConfirmDeleteOpen(true)} />
            </IconWrapper>
            <Subject>
                {subject}
                <Indicator component="span">{primaryEmail.type || "inbox"}</Indicator>
            </Subject>

            <Box sx={{ px: 2, pb: 3, maxWidth: 980 }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2, ml: 9 }}>
                    {emailLabels.map((label) => (
                        <Chip key={label} label={label} size="small" onDelete={() => saveLabels(emailLabels.filter((item) => item !== label))} />
                    ))}
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id="label-select">Add label</InputLabel>
                        <Select
                            labelId="label-select"
                            label="Add label"
                            value=""
                            onChange={(event) => {
                                const value = event.target.value;
                                if (value && !emailLabels.includes(value)) {
                                    saveLabels([...emailLabels, value]);
                                }
                            }}
                        >
                            {labels.map((label) => (
                                <MenuItem key={label._id} value={label.slug}>{label.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Box>

                {Array.isArray(primaryEmail.attachments) && primaryEmail.attachments.length > 0 && (
                    <Box sx={{ mb: 2, ml: 9, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {primaryEmail.attachments.map((attachment) => (
                            <Button
                                key={attachment.attachment_id}
                                component={Link}
                                href={`${API_URL}/email/${primaryEmail._id}/attachments/${attachment.attachment_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="outlined"
                                size="small"
                            >
                                {attachment.filename}
                            </Button>
                        ))}
                    </Box>
                )}

                <Box sx={{ ml: 9 }}>
                    {thread.map((message) => (
                        <ThreadMessage
                            key={message._id || message.messageId}
                            message={message}
                            onReply={(item, plainBody) => openReplyDraft(item, plainBody, 'reply')}
                            onReplyAll={(item, plainBody) => openReplyDraft(item, plainBody, 'reply-all')}
                            onForward={(item, plainBody) => openReplyDraft(item, plainBody, 'forward')}
                        />
                    ))}
                </Box>
            </Box>

            <ConfirmDialog
                open={confirmDeleteOpen}
                title={type === 'bin' ? 'Delete forever?' : 'Move to Bin?'}
                message={type === 'bin'
                    ? 'Permanently delete this message? This cannot be undone.'
                    : 'Move this message to Bin?'}
                confirmLabel={type === 'bin' ? 'Delete forever' : 'Move to Bin'}
                onConfirm={deleteEmail}
                onCancel={() => setConfirmDeleteOpen(false)}
            />

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ViewEmail;
