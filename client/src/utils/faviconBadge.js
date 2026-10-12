const BASE_FAVICON = '/favicon-64.png';
const BADGE_LIMIT = 99;
let badgeRequest = 0;

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
    const request = ++badgeRequest;
    link.type = 'image/png';
    link.href = BASE_FAVICON;

    if (unreadCount <= 0 || typeof document.createElement !== 'function') {
        return;
    }

    const image = new Image();
    image.onload = () => {
        if (request !== badgeRequest) return;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.drawImage(image, 0, 0, 128, 128);
        context.fillStyle = '#2563eb';
        drawRoundedRect(context, 72, 72, 56, 56, 18);
        context.fill();

        const label = unreadCount > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unreadCount);
        context.fillStyle = '#ffffff';
        context.font = label.length > 2 ? '800 25px Arial, sans-serif' : '800 36px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, 100, 101);
        link.href = canvas.toDataURL('image/png');
    };
    image.src = '/mailshot-icon-192.png';
};
