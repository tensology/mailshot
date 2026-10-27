import { useEffect, useMemo, useRef } from 'react';
import { buildEmailDocument } from '../../utils/emailDocument';

const EmailHtml = ({ html, originalHtml, title = 'Email message' }) => {
    const frameRef = useRef(null);
    const cleanupRef = useRef(() => {});
    const source = useMemo(() => buildEmailDocument(html, originalHtml), [html, originalHtml]);

    useEffect(() => () => cleanupRef.current(), []);

    const resize = () => {
        cleanupRef.current();
        const frame = frameRef.current;
        const doc = frame?.contentDocument;
        if (!doc?.body) return;
        const updateHeight = () => {
            const body = doc.body;
            const style = frame.contentWindow.getComputedStyle(body);
            const height = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)
                + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0)
                + (doc.documentElement.scrollWidth > frame.clientWidth ? 20 : 0));
            frame.style.height = `${Math.max(height + 2, 1)}px`;
        };
        const observer = new ResizeObserver(updateHeight);
        observer.observe(doc.body);
        doc.addEventListener('load', updateHeight, true);
        updateHeight();
        cleanupRef.current = () => {
            observer.disconnect();
            doc.removeEventListener('load', updateHeight, true);
        };
    };

    return <iframe ref={frameRef} title={title} srcDoc={source} onLoad={resize}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer" className="block w-full border-0 bg-white" />;
};

export default EmailHtml;
