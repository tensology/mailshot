import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Box,
    Typography,
    InputBase,
    TextField,
    Button,
    Snackbar,
    Alert,
    CircularProgress,
    IconButton
} from '@mui/material';
import {
    Close,
    Minimize,
    OpenInFull,
    CloseFullscreen,
    AttachFile
} from '@mui/icons-material';
import useApi from '../hooks/useApi';
import { API_URLS } from '../services/api.urls';
import { useCompose } from '../context/ComposeContext';

const getWindowStyles = (composeState) => {
    if (composeState === 'minimized') {
        return {
            width: 280,
            height: 44,
            maxHeight: 44
        };
    }

    if (composeState === 'expanded') {
        return {
            width: 'min(960px, calc(100vw - 48px))',
            height: 'min(720px, calc(100vh - 48px))'
        };
    }

    return {
        width: 560,
        height: 560
    };
};

const ComposeMail = ({ onSent }) => {
    const { isOpen, composeState, draft, closeCompose, setComposeState } = useCompose();
    const [data, setData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '' });
    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const sendEmailService = useApi(API_URLS.sendEmail);
    const saveDraftService = useApi(API_URLS.saveDraftEmails);
    const getContactsService = useApi(API_URLS.getContacts);
    const [contactOptions, setContactOptions] = useState([]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setData({
            to: draft.to || '',
            cc: draft.cc || '',
            bcc: draft.bcc || '',
            subject: draft.subject || '',
            body: draft.body || ''
        });
        setShowCc(Boolean(draft.show_cc || draft.cc));
        setShowBcc(Boolean(draft.show_bcc || draft.bcc));
        setAttachments([]);

        getContactsService.call().then((result) => {
            if (!result.error && Array.isArray(result.data)) {
                setContactOptions(result.data);
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, draft]);

    const onValueChange = (event) => {
        setData({ ...data, [event.target.name]: event.target.value });
    };

    const onAttachmentChange = (event) => {
        setAttachments(Array.from(event.target.files || []));
    };

    const resetForm = () => {
        setData({ to: '', cc: '', bcc: '', subject: '', body: '' });
        setShowCc(false);
        setShowBcc(false);
        setAttachments([]);
    };

    const sendEmail = async (event) => {
        event.preventDefault();

        if (!data.to?.trim()) {
            setSnackbar({ open: true, message: 'Recipient is required', severity: 'error' });
            return;
        }

        if (!data.subject?.trim()) {
            setSnackbar({ open: true, message: 'Subject is required', severity: 'error' });
            return;
        }

        const payload = new FormData();
        payload.append('to', data.to);
        if (data.cc?.trim()) {
            payload.append('cc', data.cc);
        }
        if (data.bcc?.trim()) {
            payload.append('bcc', data.bcc);
        }
        payload.append('subject', data.subject);
        payload.append('body', data.body || '');
        if (draft.in_reply_to) {
            payload.append('inReplyTo', draft.in_reply_to);
        }
        if (draft.references?.length) {
            payload.append('references', draft.references.join(','));
        }
        attachments.forEach((file) => payload.append('attachments', file));

        const result = await sendEmailService.call(payload);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        setSnackbar({ open: true, message: 'Message sent', severity: 'success' });
        closeCompose();
        resetForm();
        if (onSent) {
            onSent();
        }
    };

    const saveDraftAndClose = async () => {
        if (!data.to && !data.subject && !data.body) {
            closeCompose();
            resetForm();
            return;
        }

        const payload = {
            to: data.to,
            from: process.env.REACT_APP_MAIL_FROM,
            subject: data.subject,
            body: data.body,
            date: new Date(),
            image: '',
            name: process.env.REACT_APP_MAILBOX_USER || 'Me',
            starred: false,
            type: 'drafts'
        };

        const result = await saveDraftService.call(payload);
        if (result.error) {
            setSnackbar({ open: true, message: result.error, severity: 'error' });
            return;
        }

        closeCompose();
        resetForm();
    };

    if (!isOpen) {
        return null;
    }

    const windowStyles = getWindowStyles(composeState);
    const isMinimized = composeState === 'minimized';

    const composeWindow = (
        <Box
            sx={{
                position: 'fixed',
                right: 24,
                bottom: 0,
                zIndex: 1400,
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                borderRadius: '12px 12px 0 0',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)',
                overflow: 'hidden',
                transition: 'width 0.2s ease, height 0.2s ease',
                ...windowStyles
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 1,
                    background: '#404040',
                    color: '#fff',
                    minHeight: 44,
                    cursor: isMinimized ? 'pointer' : 'default'
                }}
                onClick={isMinimized ? () => setComposeState('normal') : undefined}
            >
                <Typography sx={{ fontSize: 14, fontWeight: 500, px: 0.5 }}>
                    {draft.title || 'New Message'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {!isMinimized && (
                        <IconButton
                            size="small"
                            sx={{ color: '#fff' }}
                            onClick={() => setComposeState(composeState === 'expanded' ? 'normal' : 'expanded')}
                        >
                            {composeState === 'expanded' ? <CloseFullscreen fontSize="small" /> : <OpenInFull fontSize="small" />}
                        </IconButton>
                    )}
                    <IconButton
                        size="small"
                        sx={{ color: '#fff' }}
                        onClick={(event) => {
                            event.stopPropagation();
                            setComposeState(isMinimized ? 'normal' : 'minimized');
                        }}
                    >
                        <Minimize fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        sx={{ color: '#fff' }}
                        onClick={(event) => {
                            event.stopPropagation();
                            saveDraftAndClose();
                        }}
                    >
                        <Close fontSize="small" />
                    </IconButton>
                </Box>
            </Box>

            {!isMinimized && (
                <>
                    <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 13, color: '#5f6368', minWidth: 28 }}>To</Typography>
                        <InputBase
                            fullWidth
                            name="to"
                            list="compose-contact-suggestions"
                            onChange={onValueChange}
                            value={data.to}
                            sx={{ fontSize: 14, py: 0.5 }}
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {!showCc && (
                                <Button size="small" sx={{ minWidth: 0, textTransform: 'none', color: '#5f6368' }} onClick={() => setShowCc(true)}>
                                    Cc
                                </Button>
                            )}
                            {!showBcc && (
                                <Button size="small" sx={{ minWidth: 0, textTransform: 'none', color: '#5f6368' }} onClick={() => setShowBcc(true)}>
                                    Bcc
                                </Button>
                            )}
                        </Box>
                        <datalist id="compose-contact-suggestions">
                            {contactOptions.map((contact) => (
                                <option key={contact._id} value={contact.email}>{contact.name}</option>
                            ))}
                        </datalist>
                    </Box>
                    {showCc && (
                        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: 13, color: '#5f6368', minWidth: 28 }}>Cc</Typography>
                            <InputBase fullWidth name="cc" onChange={onValueChange} value={data.cc} sx={{ fontSize: 14, py: 0.5 }} />
                        </Box>
                    )}
                    {showBcc && (
                        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: 13, color: '#5f6368', minWidth: 28 }}>Bcc</Typography>
                            <InputBase fullWidth name="bcc" onChange={onValueChange} value={data.bcc} sx={{ fontSize: 14, py: 0.5 }} />
                        </Box>
                    )}
                    <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e8eaed' }}>
                        <InputBase
                            fullWidth
                            placeholder="Subject"
                            name="subject"
                            onChange={onValueChange}
                            value={data.subject}
                            sx={{ fontSize: 14, py: 0.5 }}
                        />
                    </Box>
                    <TextField
                        multiline
                        minRows={composeState === 'expanded' ? 16 : 10}
                        name="body"
                        onChange={onValueChange}
                        value={data.body}
                        placeholder="Write your message"
                        sx={{
                            flex: 1,
                            px: 2,
                            '& .MuiOutlinedInput-root': {
                                alignItems: 'flex-start'
                            },
                            '& fieldset': { border: 'none' }
                        }}
                    />
                    {attachments.length > 0 && (
                        <Box sx={{ px: 2, py: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                                {attachments.length} attachment(s) selected
                            </Typography>
                        </Box>
                    )}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            px: 2,
                            py: 1.5,
                            borderTop: '1px solid #e8eaed'
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                                variant="contained"
                                onClick={sendEmail}
                                disabled={sendEmailService.isLoading}
                                sx={{
                                    textTransform: 'none',
                                    borderRadius: '18px',
                                    background: '#0B57D0',
                                    minWidth: 88,
                                    boxShadow: 'none'
                                }}
                            >
                                {sendEmailService.isLoading ? <CircularProgress size={18} color="inherit" /> : 'Send'}
                            </Button>
                            <Button component="label" startIcon={<AttachFile />} sx={{ textTransform: 'none', color: '#5f6368' }}>
                                Attach
                                <input hidden type="file" multiple onChange={onAttachmentChange} />
                            </Button>
                        </Box>
                    </Box>
                </>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );

    return createPortal(composeWindow, document.body);
};

export default ComposeMail;
