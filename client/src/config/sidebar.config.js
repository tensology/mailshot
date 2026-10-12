import {
    Archive,
    Clock,
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
    { name: 'inbox', title: 'Inbox', icon: Inbox, tone: 'bg-blue-100 text-blue-700', path: routes.emails.path },
    { name: 'starred', title: 'Starred', icon: Star, tone: 'bg-amber-100 text-amber-700', path: routes.emails.path },
    { name: 'snoozed', title: 'Snoozed', icon: Clock, tone: 'bg-violet-100 text-violet-700', path: routes.emails.path },
    { name: 'sent', title: 'Sent', icon: Send, tone: 'bg-cyan-100 text-cyan-700', path: routes.emails.path },
    { name: 'drafts', title: 'Drafts', icon: FileText, tone: 'bg-indigo-100 text-indigo-700', path: routes.emails.path },
    { name: 'bin', title: 'Bin', icon: Trash2, tone: 'bg-red-100 text-red-700', path: routes.emails.path },
    { name: 'spam', title: 'Spam', icon: OctagonAlert, tone: 'bg-orange-100 text-orange-700', path: routes.emails.path },
    { name: 'allmail', title: 'All Mail', icon: Mail, tone: 'bg-sky-100 text-sky-700', path: routes.emails.path },
    { name: 'archived', title: 'Archived', icon: Archive, tone: 'bg-emerald-100 text-emerald-700', path: routes.emails.path }
];
