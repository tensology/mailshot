import { useState } from "react";
import { Box, Typography, styled, Button, TextField } from "@mui/material";
import { useOutletContext, useLocation, useNavigate } from "react-router-dom";
import { emptyProfilePic } from "../constants/constant";
import { ArrowBack, Delete } from "@mui/icons-material";
import useApi from "../hooks/useApi";
import { API_URLS } from "../services/api.urls";
import { formatEmailBody } from "../utils/emailFormatter";

const IconWrapper = styled(Box)({
    padding: 15
});

const Subject = styled(Typography)({
    fontSize: 22,
    margin: "10px 0 20px 75px",
    display: "flex"
})

const Indicator = styled(Box)({
    fontSize: "12px !important",
    background: "#ddd",
    color: "#222",
    borderRadius: "4px",
    marginLeft: 6,
    padding: "2px 4px",
    alignSelf: "center",
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
})

const Body = styled(Typography)({
    marginTop: 20,
    whiteSpace: "pre-wrap",
    lineHeight: 1.6
});

const ViewEmail = () => {
    const { openDrawer } = useOutletContext();
    const sendEmailService = useApi(API_URLS.sendEmail);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyBody, setReplyBody] = useState("");
    const { state } = useLocation();
    const navigate = useNavigate();
    const email = state?.email;

    if (!email) {
        return (
            <Box style={openDrawer ? { marginLeft: 250, width: "100%", padding: 30 } : { width: "100%", padding: 30 }}>
                <Typography variant="h6">Could not load this message.</Typography>
                <Typography style={{ marginTop: 8 }}>Open an email from the list first, then view it.</Typography>
                <Button
                    variant="contained"
                    style={{ marginTop: 16 }}
                    onClick={() => navigate("/emails/inbox")}
                >
                    Back to Inbox
                </Button>
            </Box>
        );
    }

    const subject = email?.subject || "No Subject";
    const body = formatEmailBody(email?.body) || "No message body available.";
    const senderName = email?.from ? String(email.from).split("@")[0] : "Unknown";

    const replyTo = () => {
        setReplyBody("\n\nOn " + (new window.Date(email.date)).toLocaleString() + ", " + email.from + " wrote:\n" + body);
        setReplyOpen(true);
    };

    const sendReply = async () => {
        const payload = {
            to: email.from,
            subject: "Re: " + subject,
            body: replyBody
        };

        await sendEmailService.call(payload);
    };

    return (
        <Box style={openDrawer ? { marginLeft: 250, width: "100%" } : { width: "100%" }}>
            <IconWrapper>
                <ArrowBack fontSize="small" color="action" onClick={() => window.history.back()} />
                <Delete fontSize="small" color="action" style={{ marginLeft: 40 }} />
            </IconWrapper>
            <Subject>{subject} <Indicator component="span">{email.type || "Inbox"}</Indicator></Subject>
            <Box style={{ display: "flex" }}>
                <Image src={emptyProfilePic} alt="profile" />
                <Container>
                    <Box>
                        <Typography>
                            {senderName}
                            <Box component="span">&nbsp;&lt;{email.from}&gt;</Box>
                        </Typography>
                        <DateText>
                            {(new window.Date(email.date)).getDate()}
                            {" \u00a0"}
                            {(new window.Date(email.date)).toLocaleString("default", { month: "long" })}
                            {" \u00a0"}
                            {(new window.Date(email.date)).getFullYear()}
                        </DateText>
                    </Box>
                    <Body>{body}</Body>
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
                                onChange={(e) => setReplyBody(e.target.value)}
                                placeholder="Write a reply"
                            />
                            <Box style={{ marginTop: 10, display: "flex", gap: 10 }}>
                                <Button variant="contained" onClick={sendReply}>Send</Button>
                                <Button onClick={() => setReplyOpen(false)}>Close</Button>
                            </Box>
                        </Box>
                    )}
                </Container>
            </Box>
        </Box>
    )
}

export default ViewEmail;
