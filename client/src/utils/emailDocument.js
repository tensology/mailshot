import DOMPurify from 'dompurify';

export const buildEmailDocument = (html, originalHtml = html) => {
    const source = new DOMParser().parseFromString(String(originalHtml || ''), 'text/html');
    source.body.innerHTML = html;
    const clean = DOMPurify.sanitize(source.documentElement.outerHTML, {
        WHOLE_DOCUMENT: true,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'base', 'link'],
    });
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    doc.querySelectorAll('a[href]').forEach((link) => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    });
    const defaults = doc.createElement('style');
    defaults.textContent = `
        html { min-height: 0; background: white; color: #1e293b; }
        body { display: flow-root; margin: 0; font: 14px/1.6 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
        img { max-width: 100% !important; height: auto !important; }
        table { max-width: 100% !important; overflow-wrap: normal; }
        .gmail_drive_chip { display: none; }
    `;
    doc.head.prepend(defaults);
    const sizing = doc.createElement('style');
    sizing.textContent = 'html, body { height: auto !important; min-height: 0 !important; } html { overflow-y: hidden !important; }';
    doc.head.append(sizing);
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; img-src https: http: data: blob:; style-src 'unsafe-inline'; font-src https: http: data:; base-uri 'none'; form-action 'none'";
    doc.head.prepend(policy);
    return `<!doctype html>${doc.documentElement.outerHTML}`;
};
