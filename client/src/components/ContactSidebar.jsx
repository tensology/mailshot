import { NavLink, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { ContactsOutlined } from '@mui/icons-material';
import { routes } from '../routes/routes';

const ContactSidebar = () => {
    const location = useLocation();
    const isActive = location.pathname === routes.contacts.path;

    return (
        <Box sx={{ mt: 1, px: 1 }}>
            <NavLink
                to={routes.contacts.path}
                style={{ textDecoration: 'none', color: 'inherit' }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 1,
                        py: 1,
                        borderRadius: '0 16px 16px 0',
                        fontSize: 14,
                        fontWeight: 500,
                        backgroundColor: isActive ? '#d3e3fd' : 'transparent',
                        '&:hover': {
                            backgroundColor: isActive ? '#d3e3fd' : '#f1f3f4'
                        }
                    }}
                >
                    <ContactsOutlined sx={{ fontSize: 20 }} />
                    <Typography variant="body2">Contacts</Typography>
                </Box>
            </NavLink>
        </Box>
    );
};

export default ContactSidebar;
