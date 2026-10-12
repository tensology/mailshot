import { routes } from '../routes/routes';

export const SIDEBAR_DATA = [
    { name: 'inbox', title: 'Inbox', icon: 'inbox', path: routes.emails.path },
    { name: 'starred', title: 'Starred', icon: 'star', path: routes.emails.path },
    { name: 'snoozed', title: 'Snoozed', icon: 'snooze', path: routes.emails.path },
    { name: 'sent', title: 'Sent', icon: 'send', path: routes.emails.path },
    { name: 'drafts', title: 'Drafts', icon: 'drafts', path: routes.emails.path },
    { name: 'bin', title: 'Bin', icon: 'bin', path: routes.emails.path },
    { name: 'spam', title: 'Spam', icon: 'spam', path: routes.emails.path },
    { name: 'allmail', title: 'All Mail', icon: 'mail', path: routes.emails.path },
    { name: 'archived', title: 'Archived', icon: 'archive', path: routes.emails.path }
];
