import { ListItem, Checkbox, Typography, Box, styled, Chip } from "@mui/material";
import { StarBorder, Star, AttachFile } from "@mui/icons-material";
import useApi from "../hooks/useApi";
import { API_URLS } from "../services/api.urls";
import { useNavigate, useParams } from "react-router-dom";
import { routes } from "../routes/routes";
import { formatListPreview, parseSenderName, formatEmailDate } from "../utils/emailFormatter";

const Wrapper = styled(ListItem)`
    padding: 0 12px 0 4px;
    background: #fff;
    cursor: pointer;
    border-bottom: 1px solid #f1f3f4;
    min-height: 40px;
    &:hover {
        box-shadow: inset 1px 0 0 #dadce0, inset -1px 0 0 #dadce0, 0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
        z-index: 1;
    }
`;

const Row = styled(Box)`
    display: flex;
    align-items: center;
    width: 100%;
    gap: 8px;
    min-width: 0;
`;

const SenderText = styled(Typography, {
    shouldForwardProp: (prop) => prop !== 'unread'
})(({ unread }) => ({
    width: 180,
    minWidth: 180,
    fontSize: 14,
    color: '#202124',
    fontWeight: unread ? 700 : 400,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
}));

const SubjectText = styled(Typography, {
    shouldForwardProp: (prop) => prop !== 'unread'
})(({ unread }) => ({
    fontSize: 14,
    color: '#202124',
    fontWeight: unread ? 700 : 400,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 220,
    minWidth: 120
}));

const SnippetText = styled(Typography)({
    fontSize: 14,
    color: '#5f6368',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    minWidth: 0
});

const DateText = styled(Typography)({
    fontSize: 12,
    color: '#5f6368',
    minWidth: 48,
    textAlign: 'right'
});

const LabelChip = styled(Chip)({
    height: 18,
    fontSize: 11,
    marginRight: 4
});

const Email = ({ email, setStarredEmail, selectedEmails, setSelectedEmails }) => {
    const toggleStarredEmailService = useApi(API_URLS.toggleStarredMails);
    const navigate = useNavigate();
    const { type } = useParams();

    const senderName = email.type === 'sent'
        ? parseSenderName(email.to)
        : parseSenderName(email.from);
    const subject = email?.subject || '(no subject)';
    const snippet = formatListPreview(email, 120);
    const hasAttachments = Array.isArray(email.attachments) && email.attachments.length > 0;
    const unread = !email.read;

    const toggleStarredEmail = async (event) => {
        event.stopPropagation();
        await toggleStarredEmailService.call({ id: email._id, value: !email.starred });
        setStarredEmail((prevState) => !prevState);
    };

    const handleChange = (event) => {
        event.stopPropagation();
        if (selectedEmails.includes(email._id)) {
            setSelectedEmails((prevState) => prevState.filter(id => id !== email._id));
        } else {
            setSelectedEmails((prevState) => [...prevState, email._id]);
        }
    };

    const openEmail = () => {
        navigate(`${routes.emails.path}/${type || 'inbox'}/${email._id}`);
    };

    return (
        <Wrapper onClick={openEmail}>
            <Row>
                <Checkbox
                    size="small"
                    checked={selectedEmails.includes(email._id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={handleChange}
                />
                {email.starred ? (
                    <Star fontSize="small" onClick={toggleStarredEmail} />
                ) : (
                    <StarBorder fontSize="small" onClick={toggleStarredEmail} />
                )}
                <SenderText unread={unread}>{senderName}</SenderText>
                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1, gap: 1 }}>
                    {(email.labels || []).slice(0, 2).map((label) => (
                        <LabelChip key={label} label={label} size="small" />
                    ))}
                    <SubjectText unread={unread}>{subject}</SubjectText>
                    <SnippetText>- {snippet}</SnippetText>
                </Box>
                {hasAttachments && <AttachFile sx={{ fontSize: 16, color: '#5f6368' }} />}
                <DateText>{formatEmailDate(email.date)}</DateText>
            </Row>
        </Wrapper>
    );
};

export default Email;
