export const forceLinksToOpenInNewTab = (html = '') => {
    const value = String(html || '');
    if (!value || typeof document === 'undefined') {
        return value;
    }

    const template = document.createElement('template');
    template.innerHTML = value;

    template.content.querySelectorAll('a[href]').forEach((link) => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    });

    return template.innerHTML;
};
