import {
    Archive,
    FileText,
    Inbox,
    Mail,
    OctagonAlert,
    Send,
    Star,
    Trash2
} from 'lucide-react';
import { routes } from '../routes/routes';

export const SIDEBAR_DATA = [
    { name: 'inbox', title: 'Inbox', icon: Inbox, path: routes.emails.path },
    { name: 'starred', title: 'Starred', icon: Star, path: routes.emails.path },
    { name: 'sent', title: 'Sent', icon: Send, path: routes.emails.path },
    { name: 'drafts', title: 'Drafts', icon: FileText, path: routes.emails.path },
    { name: 'bin', title: 'Bin', icon: Trash2, path: routes.emails.path },
    { name: 'spam', title: 'Spam', icon: OctagonAlert, path: routes.emails.path },
    { name: 'allmail', title: 'All Mail', icon: Mail, path: routes.emails.path },
    { name: 'archived', title: 'Archived', icon: Archive, path: routes.emails.path }
];
