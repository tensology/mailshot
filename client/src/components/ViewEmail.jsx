import { useEffect, useMemo, useState } from "react";
import { Box, Typography, styled, Button, TextField, CircularProgress, Snackbar, Alert, Link, Chip, MenuItem, Select, FormControl, InputLabel } from "@mui/material";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { emptyProfilePic } from "../constants/constant";
import { ArrowBack, Delete } from "@mui/icons-material";
import useApi from "../hooks/useApi";
import { API_URLS } from "../services/api.urls";
import { formatEmailBody, parseSenderEmail, parseSenderName, extractHtmlBody } from "../utils/emailFormatter";
import { clearEmailListCache } from "../utils/emailListCache";
import ConfirmDialog from "./common/ConfirmDialog";

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

const Image = styled("img")({
    borderRadius: "50%",
    width: 40,
    height: 40,
    margin: "5px 10px 0 10px",
    backgroundColor: "#cccccc"
});

const Container = styled(Box)({
    marginLeft: 15,
    width: "100%",
    "& > div": {
        display: "flex",
        "& > p > span": {
            fontSize: 12,
            color: "#5E5E5E"
        }
    }
});

const DateText = styled(Typography)({
    margin: "0 50px 0 auto",
    fontSize: 12,
    color: "#5E5E5E"
});

const Body = styled(Box)({
    marginTop: 20,
    lineHeight: 1.6,
    color: "#202124",
    background: "#fff",
    padding: 16,
    borderRadius: 8,
    overflowX: "auto",
    "& a": {
        color: "#1a73e8",
        textDecoration: "underline"
    },
    "& img": {
        maxWidth: "100%",
        height: "auto"
    },
    "& table": {
        maxWidth: "100%"
    }
});

const ViewEmail = () => {
    const { openDrawer } = useOutletContext();
    const sendEmailService = useApi(API_URLS.sendEmail);
    const getEmailService = useApi(API_URLS.getEmailById);
    const getLabelsService = useApi(API_URLS.getLabels);
    const updateEmailLabelsService = useApi(API_URLS.updateEmailLabels);
    const moveEmailsToBin = useApi(API_URLS.moveEmailsToBin);
    const deleteEmailsService = useApi(API_URLS.deleteEmails);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [labels, setLabels] = useState([]);
    const [emailLabels, setEmailLabels] = useState([]);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyBody, setReplyBody] = useState("");
    const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
    const [loadError, setLoadError] = useState('');
    const { type, id } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        const loadEmail = async () => {
            if (!id) {
                return;
            }

            setLoadError('');
            const result = await getEmailService.call({}, id);
            if (result.error) {
                if (result.error === 'Email not found' || String(result.error).toLowerCase().includes('not found')) {
                    clearEmailListCache();
                }
                setLoadError(result.error);
            } else if (!result.data || typeof result.data !== 'object') {
                setLoadError('Could not load this message.');
            }
        };

        loadEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        getLabelsService.call();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const email = getEmailService.response;

    useEffect(() => {
        if (Array.isArray(getLabelsService.response)) {
            setLabels(getLabelsService.response);
        }
    }, [getLabelsService.response]);

    useEffect(() => {
        if (email?.labels) {
            setEmailLabels(email.labels);
        }
    }, [email]);

    const sanitizedHtml = useMemo(() => {
        if (!email?.body_html) {
            return '';
        }

        const bodyHtml = extractHtmlBody(email.body_html);
        const cleaned = DOMPurify.sanitize(bodyHtml, {
            ADD_ATTR: ['target', 'rel', 'style'],
            ADD_TAGS: ['style']
        });

        return cleaned;
    }, [email?.body_html]);

    const plainBody = formatEmailBody(email?.body) || "No message body available.";

    if (getEmailService.isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 8, marginLeft: openDrawer ? 250 : 0 }}>
                <CircularProgress size={28} />
                <Typography>Loading message...</Typography>
            </Box>
        );
    }

    if (!email || loadError) {
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

    const subject = email?.subject || "(no subject)";
    const senderName = parseSenderName(email.from);
    const senderEmail = parseSenderEmail(email.from);

    const replyTo = () => {
        setReplyBody(`\n\nOn ${new Date(email.date).toLocaleString()}, ${email.from} wrote:\n${plainBody}`);
        setReplyOpen(true);
    };

    const sendReply = async () => {
        const references = [...(email.references || []), email.messageId].filter(Boolean);
        const payload = new FormData();
        payload.append('to', senderEmail);
        payload.append('subject', subject.startsWith('Re:') ? subject : `Re: ${subject}`);
        payload.append('body', replyBody);
        if (email.messageId) {
            payload.append('inReplyTo', email.messageId);
            payload.append('references', references.join(','));
        }

        const result = await sendEmailService.call(payload);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        setSnackbar({ open: true, message: 'Reply sent', severity: 'success' });
        setReplyOpen(false);
    };

    const saveLabels = async (nextLabels) => {
        setEmailLabels(nextLabels);
        const result = await updateEmailLabelsService.call({ labels: nextLabels }, `${email._id}/labels`);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
        }
    };

    const deleteEmail = async () => {
        const result = type === 'bin'
            ? await deleteEmailsService.call([email._id])
            : await moveEmailsToBin.call([email._id]);

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
                <Indicator component="span">{email.type || "inbox"}</Indicator>
            </Subject>
            <Box style={{ display: "flex" }}>
                <Image src={emptyProfilePic} alt="profile" />
                <Container>
                    <Box>
                        <Typography>
                            {senderName}
                            <Box component="span">&nbsp;&lt;{senderEmail}&gt;</Box>
                        </Typography>
                        <DateText>{new Date(email.date).toLocaleString()}</DateText>
                    </Box>

                    <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
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

                    {Array.isArray(email.attachments) && email.attachments.length > 0 && (
                        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {email.attachments.map((attachment) => (
                                <Button
                                    key={attachment.attachment_id}
                                    component={Link}
                                    href={`${API_URL}/email/${email._id}/attachments/${attachment.attachment_id}`}
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

                    <Body>
                        {sanitizedHtml && sanitizedHtml.replace(/<[^>]+>/g, '').trim() ? (
                            <Box dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                        ) : (
                            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{plainBody}</Typography>
                        )}
                    </Body>

                    <Box style={{ marginTop: 20 }}>
                        <Button variant="contained" onClick={replyTo}>Reply</Button>
                    </Box>

                    {replyOpen && (
                        <Box style={{ marginTop: 20 }}>
                            <TextField
                                multiline
                                minRows={6}
                                fullWidth
                                value={replyBody}
                                onChange={(event) => setReplyBody(event.target.value)}
                                placeholder="Write a reply"
                            />
                            <Box style={{ marginTop: 10, display: "flex", gap: 10 }}>
                                <Button variant="contained" onClick={sendReply} disabled={sendEmailService.isLoading}>
                                    {sendEmailService.isLoading ? 'Sending...' : 'Send'}
                                </Button>
                                <Button onClick={() => setReplyOpen(false)}>Close</Button>
                            </Box>
                        </Box>
                    )}
                </Container>
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
