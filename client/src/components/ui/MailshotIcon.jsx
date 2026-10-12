import { useId } from 'react';

const PALETTES = {
    archive: ['#06b6d4', '#0369a1'],
    check: ['#34d399', '#047857'],
    unarchive: ['#34d399', '#047857'],
    attach: ['#64748b', '#334155'],
    back: ['#60a5fa', '#1d4ed8'],
    bin: ['#fb7185', '#be123c'],
    delete: ['#fb7185', '#dc2626'],
    download: ['#38bdf8', '#2563eb'],
    edit: ['#fbbf24', '#d97706'],
    drafts: ['#818cf8', '#4f46e5'],
    external: ['#22d3ee', '#0284c7'],
    forward: ['#22d3ee', '#0369a1'],
    inbox: ['#60a5fa', '#2563eb'],
    close: ['#fb7185', '#be123c'],
    expand: ['#818cf8', '#4338ca'],
    logout: ['#fb7185', '#be123c'],
    mail: ['#38bdf8', '#1d4ed8'],
    menu: ['#94a3b8', '#475569'],
    minimize: ['#94a3b8', '#475569'],
    mute: ['#e879f9', '#a21caf'],
    plus: ['#60a5fa', '#2563eb'],
    print: ['#94a3b8', '#334155'],
    read: ['#34d399', '#059669'],
    refresh: ['#2dd4bf', '#0f766e'],
    reply: ['#60a5fa', '#1d4ed8'],
    'reply-all': ['#818cf8', '#4338ca'],
    send: ['#22d3ee', '#2563eb'],
    search: ['#94a3b8', '#475569'],
    save: ['#60a5fa', '#1d4ed8'],
    settings: ['#94a3b8', '#475569'],
    snooze: ['#c084fc', '#7e22ce'],
    spam: ['#fb923c', '#c2410c'],
    speaker: ['#2dd4bf', '#0f766e'],
    star: ['#facc15', '#d97706'],
    tag: ['#a78bfa', '#6d28d9'],
    unread: ['#818cf8', '#4338ca'],
    undo: ['#34d399', '#047857'],
    wake: ['#f472b6', '#be185d']
};

const glyph = (name) => {
    switch (name) {
        case 'archive': return <><path d="M5 8.5h14v10H5z"/><path d="M4 5.5h16v3H4z"/><path d="M9 12h6"/></>;
        case 'unarchive': return <><path d="M5 9h14v9.5H5z"/><path d="M4 6h16v3H4z"/><path d="m9 14 3-3 3 3"/></>;
        case 'attach': return <path d="M8.2 12.8 13.8 7a3 3 0 0 1 4.3 4.2l-7.3 7.5a4.2 4.2 0 0 1-6-6L12 5.3"/>;
        case 'back': return <><path d="m10 6-6 6 6 6"/><path d="M5 12h15"/></>;
        case 'check': return <><path d="m6 12 4 4 8-9"/></>;
        case 'bin':
        case 'delete': return <><path d="M7 8h10l-.7 11H7.7z"/><path d="M5 6h14M9 6V4h6v2M10 11v5M14 11v5"/></>;
        case 'download': return <><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 17v2h14v-2"/></>;
        case 'close': return <><path d="m7 7 10 10M17 7 7 17"/></>;
        case 'drafts': return <><path d="M6 4h9l3 3v13H6z"/><path d="M14 4v4h4M9 12h6M9 15h5"/></>;
        case 'edit': return <><path d="m6 16-1 4 4-1L18 10l-3-3z"/><path d="m13 9 3 3"/></>;
        case 'external': return <><path d="M13 5h6v6"/><path d="m19 5-8 8"/><path d="M17 14v5H5V7h5"/></>;
        case 'expand': return <><path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4"/></>;
        case 'forward': return <><path d="m13 7 6 5-6 5v-3H6a3 3 0 0 0-2 1 7 7 0 0 1 7-7h2z"/></>;
        case 'inbox': return <><path d="M5 6h14l2 8v5H3v-5z"/><path d="M3 14h5l2 2h4l2-2h5"/></>;
        case 'mail':
        case 'unread': return <><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></>;
        case 'menu': return <><path d="M5 7h14M5 12h14M5 17h14"/></>;
        case 'minimize': return <><path d="M6 12h12"/></>;
        case 'mute': return <><path d="M7 16h10l-1.5-2V10a3.5 3.5 0 0 0-7 0v4z"/><path d="M10 19h4M5 5l14 14"/></>;
        case 'plus': return <><path d="M12 6v12M6 12h12"/></>;
        case 'logout': return <><path d="M11 5H5v14h6"/><path d="M13 8l4 4-4 4M8 12h9"/></>;
        case 'print': return <><path d="M7 9V4h10v5M7 16H5v-6h14v6h-2"/><path d="M7 14h10v6H7z"/><path d="M16.5 11.5h.01"/></>;
        case 'read': return <><path d="M4 7h16v11H4z"/><path d="m4 8 8 5 8-5"/><path d="m8.5 17 2 2 5-5"/></>;
        case 'refresh': return <><path d="M18 8a7 7 0 0 0-12-1l-2 2"/><path d="M4 5v4h4M6 16a7 7 0 0 0 12 1l2-2"/><path d="M20 19v-4h-4"/></>;
        case 'reply': return <path d="m11 7-6 5 6 5v-3h4a5 5 0 0 1 5 4c0-7-3-9-9-9z"/>;
        case 'reply-all': return <><path d="m9 8-5 4 5 4v-2h4a6 6 0 0 1 6 4c0-6-3-8-10-8z"/><path d="m13 6-2 2 2 2"/></>;
        case 'send': return <><path d="m4 5 17 7-17 7 3-6 8-1-8-1z"/></>;
        case 'search': return <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></>;
        case 'save': return <><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>;
        case 'settings': return <><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></>;
        case 'snooze':
        case 'wake': return <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>;
        case 'spam': return <><path d="m8 4-4 4v8l4 4h8l4-4V8l-4-4z"/><path d="M12 8v5M12 16h.01"/></>;
        case 'speaker': return <><path d="M5 10v4h3l4 3V7l-4 3z"/><path d="M15 9a4 4 0 0 1 0 6M17 7a7 7 0 0 1 0 10"/></>;
        case 'star': return <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z"/>;
        case 'tag': return <><path d="M4 5h7l9 9-6 6-9-9z"/><circle cx="8.5" cy="8.5" r="1"/></>;
        case 'undo': return <><path d="m9 7-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></>;
        default: return <><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></>;
    }
};

const MailshotIcon = ({ name = 'mail', size = 24, className = '', title }) => {
    const rawId = useId().replace(/:/g, '');
    const [from, to] = PALETTES[name] || ['#60a5fa', '#2563eb'];
    const gradientId = `mailshot-${rawId}`;
    const shadowId = `mailshot-shadow-${rawId}`;

    return (
        <svg
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={`shrink-0 ${className}`}
        >
            {title && <title>{title}</title>}
            <defs>
                <linearGradient id={gradientId} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stopColor={from} />
                    <stop offset="1" stopColor={to} />
                </linearGradient>
                <filter id={shadowId} x="-30%" y="-30%" width="160%" height="170%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor={to} floodOpacity=".38" />
                </filter>
            </defs>
            <rect x="2" y="2" width="20" height="20" rx="6" fill={`url(#${gradientId})`} filter={`url(#${shadowId})`} />
            <path d="M5 5.5c3-2 11-2 14 0" fill="none" stroke="white" strokeOpacity=".25" strokeWidth="1" />
            <g fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {glyph(name)}
            </g>
        </svg>
    );
};

export default MailshotIcon;
