import { useId } from 'react';

const resolveType = (filename = '', contentType = '') => {
    const name = filename.toLowerCase();
    const type = contentType.toLowerCase();
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (type.includes('zip') || /\.(zip|rar|7z|tar|gz)$/.test(name)) return 'zip';
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image';
    if (type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/.test(name)) return 'audio';
    if (type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(name)) return 'video';
    if (/\.(docx?|odt|rtf)$/.test(name)) return 'doc';
    if (/\.(xlsx?|csv|ods)$/.test(name)) return 'sheet';
    return 'file';
};

const TYPES = {
    pdf: { label: 'PDF', from: '#fb7185', to: '#b91c1c' },
    zip: { label: 'ZIP', from: '#fbbf24', to: '#c2410c' },
    image: { label: 'IMG', from: '#c084fc', to: '#6d28d9' },
    audio: { label: 'MP3', from: '#2dd4bf', to: '#0f766e' },
    video: { label: 'VID', from: '#fb7185', to: '#be185d' },
    doc: { label: 'DOC', from: '#60a5fa', to: '#1d4ed8' },
    sheet: { label: 'XLS', from: '#34d399', to: '#047857' },
    file: { label: 'FILE', from: '#94a3b8', to: '#475569' }
};

const MailshotFileIcon = ({ filename = '', contentType = '', size = 56, className = '' }) => {
    const type = resolveType(filename, contentType);
    const meta = TYPES[type];
    const rawId = useId().replace(/:/g, '');
    const gradientId = `file-${rawId}`;

    return (
        <svg aria-hidden="true" viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 drop-shadow-md ${className}`}>
            <defs>
                <linearGradient id={gradientId} x1="15" y1="8" x2="52" y2="57" gradientUnits="userSpaceOnUse">
                    <stop stopColor={meta.from} />
                    <stop offset="1" stopColor={meta.to} />
                </linearGradient>
            </defs>
            <path d="M14 5h25l12 12v40H14z" fill="white" stroke="#cbd5e1" strokeWidth="2" />
            <path d="M39 5v13h12" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" />
            {type === 'zip' && <><path d="M28 8h8v5h-8zM32 13h8v5h-8zM28 18h8v5h-8zM32 23h8v5h-8z" fill="#92400e"/><rect x="29" y="28" width="10" height="8" rx="2" fill="#fbbf24" stroke="#92400e"/><circle cx="34" cy="32" r="1.5" fill="#92400e"/></>}
            {type === 'image' && <><circle cx="27" cy="23" r="4" fill="#c084fc"/><path d="m20 38 8-8 5 5 4-4 8 7" fill="none" stroke="#7e22ce" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
            {type === 'audio' && <><path d="M37 16v18a6 6 0 1 1-4-5.7V19l13-3v14a6 6 0 1 1-4-5.7V14z" fill={`url(#${gradientId})`}/></>}
            {type === 'video' && <><rect x="20" y="17" width="26" height="22" rx="5" fill={`url(#${gradientId})`}/><path d="m30 23 10 5-10 5z" fill="white"/></>}
            {!['zip', 'image', 'audio', 'video'].includes(type) && <><path d="M22 23h19M22 29h19M22 35h14" stroke={meta.from} strokeWidth="3" strokeLinecap="round"/></>}
            <rect x="8" y="39" width="48" height="18" rx="6" fill={`url(#${gradientId})`} />
            <path d="M13 42h38" stroke="white" strokeOpacity=".25" strokeWidth="2" strokeLinecap="round" />
            <text x="32" y="52" textAnchor="middle" fill="white" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="10" letterSpacing="1">{meta.label}</text>
        </svg>
    );
};

export { resolveType };
export default MailshotFileIcon;
