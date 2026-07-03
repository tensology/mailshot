const BASE_FAVICON = '/favicon.svg';
const BADGE_LIMIT = 99;

const ensureFaviconLink = () => {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    return link;
};

const drawRoundedRect = (context, x, y, width, height, radius) => {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
};

export const setMailshotFaviconBadge = (count = 0) => {
    if (typeof document === 'undefined') {
        return;
    }

    const link = ensureFaviconLink();
    const unreadCount = Math.max(0, Number(count) || 0);

    if (unreadCount <= 0 || typeof document.createElement !== 'function') {
        link.type = 'image/svg+xml';
        link.href = BASE_FAVICON;
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
        link.type = 'image/svg+xml';
        link.href = BASE_FAVICON;
        return;
    }

    context.fillStyle = '#2563eb';
    drawRoundedRect(context, 0, 0, 128, 128, 32);
    context.fill();

    context.fillStyle = '#ffffff';
    context.font = '700 56px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('M', 44, 58);

    const label = unreadCount > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unreadCount);
    context.textAlign = 'right';
    context.textBaseline = 'alphabetic';
    context.lineJoin = 'round';
    context.lineWidth = label.length > 2 ? 9 : 10;
    context.strokeStyle = '#ffffff';
    context.fillStyle = '#020617';
    context.font = label.length > 2 ? '900 42px Arial, sans-serif' : '900 54px Arial, sans-serif';
    context.strokeText(label, 124, 123);
    context.fillText(label, 124, 123);

    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
};
