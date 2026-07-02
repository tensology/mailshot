const unique = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.url)) {
            return false;
        }
        seen.add(item.url);
        return true;
    });
};

const extractUrls = (value = '') => (
    String(value || '').match(/https?:\/\/[^\s"'<>]+/gi) || []
).map((url) => url.replace(/[),.;]+$/g, ''));

const getYouTubeId = (url) => {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.split('/').filter(Boolean)[0] || '';
        }
        if (parsed.hostname.includes('youtube.com')) {
            return parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || '';
        }
    } catch {
        return '';
    }
    return '';
};

const getDrivePreviewUrl = (url) => {
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.includes('drive.google.com')) {
            return '';
        }
        const fileIndex = parsed.pathname.split('/').indexOf('d');
        const fileId = fileIndex >= 0 ? parsed.pathname.split('/')[fileIndex + 1] : parsed.searchParams.get('id');
        return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : url;
    } catch {
        return '';
    }
};

export const getEmbeddableLinks = (email = {}) => unique(extractUrls(`${email.body_html || ''} ${email.body || ''}`)
    .map((url) => {
        const youtubeId = getYouTubeId(url);
        if (youtubeId) {
            return {
                type: 'youtube',
                label: 'YouTube',
                url,
                embedUrl: `https://www.youtube.com/embed/${youtubeId}`
            };
        }

        const drivePreviewUrl = getDrivePreviewUrl(url);
        if (drivePreviewUrl) {
            return {
                type: 'drive',
                label: 'Google Drive',
                url,
                embedUrl: drivePreviewUrl
            };
        }

        return null;
    })
    .filter(Boolean));
