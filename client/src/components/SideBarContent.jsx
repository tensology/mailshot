import { useState } from 'react';
import { Button, List, ListItem, Box, styled } from '@mui/material';
import ComposeMail from './ComposeMail';
import LabelSidebar from './LabelSidebar';
import ContactSidebar from './ContactSidebar';
import { SIDEBAR_DATA } from '../config/sidebar.config';
import { CreateOutlined } from '@mui/icons-material';
import { NavLink, useParams } from 'react-router-dom';
import { routes } from '../routes/routes';
import { useCompose } from '../context/ComposeContext';

const Container = styled(Box)`
    padding: 8px;
    & > ul {
        padding: 10px 0 0 5px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        & > a {
            text-decoration: none;
            color: inherit;
        }
        & > a > li > svg {
            margin-right: 20px;
        }
    }
`;

const ComposeButton = styled(Button)`
    background: #c2e7ff;
    color: #001d35;
    border-radius: 16px;
    padding: 15px;
    min-width: 140px;
    text-transform: none;
    box-shadow: 0 1px 2px rgba(0,0,0,0.12);
    &:hover {
        background: #a8d7fa;
        box-shadow: 0 2px 6px rgba(0,0,0,0.16);
    }
`;

const SideBarContent = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const { type } = useParams();
    const { openCompose } = useCompose();

    return (
        <Container>
            <ComposeButton onClick={() => openCompose()}>
                <CreateOutlined style={{ marginRight: 10 }} />Compose
            </ComposeButton>
            <List>
                {SIDEBAR_DATA.map((data) => (
                    <NavLink key={data.name} to={`${routes.emails.path}/${data.name}`}>
                        <ListItem style={type === data.name.toLowerCase() ? {
                            backgroundColor: '#d3e3fd',
                            borderRadius: '0 16px 16px 0'
                        } : {}}>
                            <data.icon fontSize="small" />{data.title}
                        </ListItem>
                    </NavLink>
                ))}
            </List>
            <LabelSidebar key={refreshKey} />
            <ContactSidebar />
            <ComposeMail onSent={() => setRefreshKey((value) => value + 1)} />
        </Container>
    );
};

export default SideBarContent;
