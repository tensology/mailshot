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
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
        link.type = 'image/svg+xml';
        link.href = BASE_FAVICON;
        return;
    }

    context.fillStyle = '#2563eb';
    drawRoundedRect(context, 0, 0, 64, 64, 16);
    context.fill();

    context.fillStyle = '#ffffff';
    context.font = '700 28px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('M', 32, 34);

    const label = unreadCount > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unreadCount);
    const badgeWidth = label.length > 2 ? 32 : 26;
    const badgeX = 64 - badgeWidth - 2;

    context.fillStyle = '#dc2626';
    drawRoundedRect(context, badgeX, 2, badgeWidth, 24, 12);
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = '#ffffff';
    context.stroke();

    context.fillStyle = '#ffffff';
    context.font = label.length > 2 ? '700 10px Arial, sans-serif' : '700 13px Arial, sans-serif';
    context.fillText(label, badgeX + badgeWidth / 2, 14);

    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
};
