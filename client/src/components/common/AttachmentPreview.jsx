import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import IconButton from '../ui/IconButton';
import MailshotIcon from '../ui/MailshotIcon';

const AttachmentPreview = ({ item, onClose }) => {
    const panelRef = useRef(null);
    const closeRef = useRef(onClose);
    const titleId = useId();
    const [failed, setFailed] = useState(false);
    closeRef.current = onClose;

    useEffect(() => {
        if (!item) return undefined;
        setFailed(false);
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusable = () => [...(panelRef.current?.querySelectorAll('button, a[href], iframe, audio, video') || [])].filter((element) => element.getClientRects().length);
        panelRef.current?.querySelector('button[aria-label="Close preview"]')?.focus();
        const keydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                closeRef.current();
            } else if (event.key === 'Tab') {
                const items = focusable();
                const first = items[0];
                const last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };
        window.addEventListener('keydown', keydown, true);
        return () => {
            window.removeEventListener('keydown', keydown, true);
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [item]);

    if (!item) return null;

    const linkClass = 'inline-flex min-h-10 shrink-0 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';
    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 sm:p-4"
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
                className="flex h-[min(42rem,calc(100dvh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl dark:bg-slate-900">
                <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700 sm:px-4">
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h2>
                        {item.sourceUrl && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.sourceUrl}</p>}
                    </div>
                    <div className="order-last flex w-full flex-wrap gap-2 sm:order-none sm:w-auto">
                        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>Open source</a>}
                        {item.objectUrl && <a href={item.url} target="_blank" rel="noopener noreferrer" className={linkClass}>Open in new tab</a>}
                    </div>
                    <IconButton label="Close preview" onClick={onClose}><MailshotIcon name="close" size={20} /></IconButton>
                </header>
                <div className="min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-800">
                    {failed ? (
                        <p role="alert" className="p-4 text-sm text-slate-700 dark:text-slate-200">This preview could not be loaded. Open the file in a new tab to view it.</p>
                    ) : (
                        <>
                            {item.kind === 'image' && <img src={item.url} alt={item.title} onError={() => setFailed(true)} className="h-full w-full object-contain" />}
                            {item.kind === 'pdf' && <iframe src={`${item.url}#page=1&view=FitH`} title={item.title} className="h-full w-full border-0 bg-white dark:bg-slate-900" />}
                            {item.kind === 'video' && <video src={item.url} controls onError={() => setFailed(true)} className="h-full w-full bg-black" />}
                            {item.kind === 'audio' && <div className="flex h-full items-center justify-center p-4 sm:p-8"><audio src={item.url} controls onError={() => setFailed(true)} className="w-full max-w-2xl" /></div>}
                            {item.kind === 'embed' && <iframe src={item.url} title={item.title} className="h-full w-full border-0 bg-white dark:bg-slate-900" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
                        </>
                    )}
                </div>
            </section>
        </div>, document.body
    );
};

export default AttachmentPreview;
