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

const drawMailshotMark = (context) => {
    const path = new Path2D('M17 44V20h7.3l7.7 12.7L39.7 20H47v24h-6.5V30.7L34.1 41h-4.2l-6.4-10.3V44H17z');
    context.save();
    context.scale(2, 2);
    context.fill(path);
    context.restore();
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
    drawMailshotMark(context);

    const label = unreadCount > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unreadCount);
    context.textAlign = 'right';
    context.textBaseline = 'alphabetic';
    context.lineJoin = 'round';
    context.lineWidth = label.length > 2 ? 11 : 13;
    context.strokeStyle = '#ffffff';
    context.fillStyle = '#020617';
    context.font = label.length > 2 ? '900 54px Arial, sans-serif' : '900 78px Arial, sans-serif';
    context.strokeText(label, 127, 126);
    context.fillText(label, 127, 126);

    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
};
