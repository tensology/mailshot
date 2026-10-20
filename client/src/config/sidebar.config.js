import { routes } from '../routes/routes.js';

export const PRIMARY_SIDEBAR = [
    { name: 'inbox', title: 'Inbox', icon: 'inbox', path: routes.emails.path },
    { name: 'starred', title: 'Starred', icon: 'star', path: routes.emails.path },
    { name: 'sent', title: 'Sent', icon: 'send', path: routes.emails.path },
    { name: 'drafts', title: 'Drafts', icon: 'drafts', path: routes.emails.path },
    { name: 'allmail', title: 'All Mail', icon: 'mail', path: routes.emails.path },
    { name: 'archived', title: 'Archived', icon: 'archive', path: routes.emails.path }
];

export const MORE_SIDEBAR = [
    { name: 'bin', title: 'Bin', icon: 'bin', path: routes.emails.path },
    { name: 'spam', title: 'Spam', icon: 'spam', path: routes.emails.path }
];

export const SIDEBAR_DATA = [...PRIMARY_SIDEBAR, ...MORE_SIDEBAR];
