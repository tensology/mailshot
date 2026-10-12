const unique = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.embedUrl)) {
            return false;
        }
        seen.add(item.embedUrl);
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

const getDriveLabels = (html = '') => new Map((String(html || '').match(/<a\b[^>]*>/gi) || [])
    .map((tag) => {
        const href = tag.match(/\bhref=(['"])(.*?)\1/i)?.[2]?.replaceAll('&amp;', '&');
        const label = tag.match(/\baria-label=(['"])(.*?)\1/i)?.[2];
        return [getDrivePreviewUrl(href), label];
    })
    .filter(([url, label]) => url && label));

export const getEmbeddableLinks = (email = {}) => {
    const driveLabels = getDriveLabels(email.body_html);
    return unique(extractUrls(`${email.body_html || ''} ${email.body || ''}`)
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
                    label: driveLabels.get(drivePreviewUrl) || 'Google Drive',
                    url,
                    embedUrl: drivePreviewUrl
                };
            }

            return null;
        })
        .filter(Boolean));
};
