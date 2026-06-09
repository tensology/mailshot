import { useState } from 'react';
import { AppBar, Toolbar, Box, InputBase, styled } from '@mui/material';
import { Menu as MenuIcon, Tune, HelpOutlineOutlined, SettingsOutlined,
    AppsOutlined, AccountCircleOutlined, Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { gmailLogo } from '../constants/constant';
import { routes } from '../routes/routes';
import { useAuth } from '../context/AuthContext';

const StyledAppBar = styled(AppBar)`
    background: #f5F5F5;
    box-shadow: none;
`;

const SearchWrapper = styled(Box)`
    background: #EAF1FB;
    margin-left: 80px;
    border-radius: 8px;
    min-width: 690px;
    max-width: 720px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    gap: 12px;
    & > div {
        width: 100%
    }
`;

const OptionsWrapper = styled(Box)`
    width: 100%;
    display: flex;
    justify-content: end;
    & > svg {
        margin-left: 20px;
    }
`;

const Header = ({ toggleDrawer }) => {
    const [searchValue, setSearchValue] = useState('');
    const navigate = useNavigate();
    const { logout, username } = useAuth();

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    const submitSearch = (event) => {
        event.preventDefault();
        const query = searchValue.trim();
        if (!query) {
            return;
        }
        navigate(`${routes.emails.path}/allmail?search=${encodeURIComponent(query)}`);
    };

    return (
        <StyledAppBar position="static">
            <Toolbar>
                <MenuIcon color="action" onClick={toggleDrawer} />
                <img src={gmailLogo} alt="logo" style={{ width: 110, marginLeft: 15 }} />
                <Box component="form" onSubmit={submitSearch} sx={{ flex: 1 }}>
                    <SearchWrapper>
                        <Search color="action" />
                        <InputBase
                            placeholder="Search mail"
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                        />
                        <Tune color="action" />
                    </SearchWrapper>
                </Box>

                <OptionsWrapper>
                    <HelpOutlineOutlined color="action" />
                    <SettingsOutlined color="action" />
                    <AppsOutlined color="action" />
                    <AccountCircleOutlined
                        color="action"
                        titleAccess={username ? `Signed in as ${username}. Click to sign out.` : 'Sign out'}
                        onClick={handleLogout}
                        style={{ cursor: 'pointer' }}
                    />
               </OptionsWrapper>
            </Toolbar>
        </StyledAppBar>
    );
};

export default Header;
