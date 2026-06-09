
import { Box, Typography, styled, Divider } from '@mui/material';

const Component = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    alignItems: 'center',
    marginTop: 50,
    opacity: .8,
});

const StyledDivider = styled(Divider)({
    width: '100%',
    marginTop: 10
})

const NoMails = ({ message }) => {
    const title = message?.heading || 'No mails to show';
    const subtitle = message?.subHeading || '';

    return (
        <Component>
            <Typography>{title}</Typography>
            <Typography>{subtitle}</Typography>
            <StyledDivider />
        </Component>
    )
}

export default NoMails;
