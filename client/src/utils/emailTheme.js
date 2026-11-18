// Theme rules live in the frame head, never in serialized message/draft HTML.
export const applyEmailTheme = (doc, theme) => {
    if (!doc?.body) return;
    doc.getElementById('mailshot-frame-theme')?.remove();
    if (theme !== 'dark') return;
    const rules = ['html { color-scheme: dark; background: #0f172a !important; color: #e2e8f0 !important; }'];
    const brightness = (value) => {
        const channels = value.match(/[\d.]+/g)?.map(Number);
        if (!channels || (channels.length === 4 && channels[3] === 0)) return null;
        return (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255;
    };
    const visit = (element, selector) => {
        const computed = doc.defaultView.getComputedStyle(element);
        const foreground = brightness(computed.color);
        const background = brightness(computed.backgroundColor);
        const declarations = [];
        if (foreground !== null && foreground < 0.65) declarations.push(`color: ${element.tagName === 'A' ? '#93c5fd' : '#e2e8f0'} !important`);
        if (background !== null && background > 0.5) declarations.push('background-color: #0f172a !important');
        if (declarations.length) rules.push(`${selector} { ${declarations.join(';')} }`);
        [...element.children].forEach((child, index) => visit(child, `${selector} > :nth-child(${index + 1})`));
    };
    visit(doc.body, 'body');
    const style = doc.createElement('style');
    style.id = 'mailshot-frame-theme';
    style.textContent = rules.join('\n');
    doc.head.append(style);
};
