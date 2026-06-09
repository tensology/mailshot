import { Box, Typography, Button } from '@mui/material';
import { emptyProfilePic } from '../constants/constant';
import { parseSenderEmail, parseSenderName, formatEmailBody } from '../utils/emailFormatter';
import QuotedContent from './common/QuotedContent';

const ThreadMessage = ({ message, onReply, onReplyAll, onForward }) => {
    const senderName = parseSenderName(message.from);
    const senderEmail = parseSenderEmail(message.from);
    const plainBody = formatEmailBody(message.body);

    return (
        <Box sx={{ borderTop: '1px solid #f1f3f4', py: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                    component="img"
                    src={emptyProfilePic}
                    alt="profile"
                    sx={{ width: 40, height: 40, borderRadius: '50%', mt: 0.5 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                                {senderName}
                                <Typography component="span" sx={{ fontSize: 12, color: '#5f6368', ml: 1 }}>
                                    &lt;{senderEmail}&gt;
                                </Typography>
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: '#5f6368', mt: 0.5 }}>
                                to {message.to}
                                {message.cc ? `, cc ${message.cc}` : ''}
                            </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 12, color: '#5f6368', whiteSpace: 'nowrap' }}>
                            {new Date(message.date).toLocaleString()}
                        </Typography>
                    </Box>

                    <Box sx={{ mt: 1.5, lineHeight: 1.6, color: '#202124' }}>
                        <QuotedContent body={message.body} bodyHtml={message.body_html} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                        <Button size="small" variant="outlined" sx={{ textTransform: 'none' }} onClick={() => onReply(message, plainBody)}>
                            Reply
                        </Button>
                        <Button size="small" variant="outlined" sx={{ textTransform: 'none' }} onClick={() => onReplyAll(message, plainBody)}>
                            Reply all
                        </Button>
                        <Button size="small" variant="outlined" sx={{ textTransform: 'none' }} onClick={() => onForward(message, plainBody)}>
                            Forward
                        </Button>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default ThreadMessage;
