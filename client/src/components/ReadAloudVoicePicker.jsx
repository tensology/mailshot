import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';

const VoiceAvatar = ({ voice }) => {
    const [failedSources, setFailedSources] = useState([]);
    const source = [voice?.avatar_url, voice?.avatar_fallback_url]
        .find((url) => url && !failedSources.includes(url));
    const initials = String(voice?.name || '').split(/\s+/).filter(Boolean)
        .slice(0, 2).map((part) => part[0]).join('').toUpperCase();

    return source
        ? <img src={source} alt="" loading="lazy" onError={() => setFailedSources((current) => [...current, source])} className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center bg-blue-50 text-sm font-medium text-blue-700" aria-hidden="true">{initials || '?'}</span>;
};

const ReadAloudVoicePicker = ({ voices = [], activeVoiceId = '', loading = false, error = '', onRetry, onSelect }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [savingId, setSavingId] = useState('');
    const [selectionError, setSelectionError] = useState('');
    const [position, setPosition] = useState({ left: 0, placement: 'above', maxHeight: 384 });
    const rootRef = useRef(null);
    const toggleRef = useRef(null);
    const searchRef = useRef(null);
    const optionsRef = useRef([]);
    const listId = useId();
    const searchId = useId();
    const activeVoice = voices.find((voice) => voice.id === activeVoiceId);
    const needle = query.trim().toLowerCase();
    const filteredVoices = needle
        ? voices.filter((voice) => [voice.name, ...(voice.languages || []), ...(voice.tags || [])]
            .some((value) => String(value).toLowerCase().includes(needle)))
        : voices;

    const close = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) toggleRef.current?.focus();
    };

    useLayoutEffect(() => {
        if (!open) return undefined;
        const align = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(352, window.innerWidth - 32);
            const above = Math.max(0, rect.top - 24);
            const below = Math.max(0, window.innerHeight - rect.bottom - 24);
            const placement = above < 332 && below > above ? 'below' : 'above';
            setPosition({
                left: Math.max(16 - rect.left, Math.min(0, window.innerWidth - 16 - width - rect.left)),
                placement,
                maxHeight: placement === 'above' ? above : below
            });
        };
        align();
        window.addEventListener('resize', align);
        window.addEventListener('scroll', align, true);
        return () => {
            window.removeEventListener('resize', align);
            window.removeEventListener('scroll', align, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        searchRef.current?.focus();
        const outside = (event) => {
            if (!rootRef.current?.contains(event.target) && !savingId) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open, savingId]);

    const choose = async (voice) => {
        if (savingId) return;
        if (voice.id === activeVoiceId) { close(true); return; }
        setSavingId(voice.id);
        setSelectionError('');
        try {
            await onSelect(voice.id);
            close(true);
        } catch (failure) {
            setSelectionError(failure?.message || 'The voice could not be saved. Please try again.');
        } finally {
            setSavingId('');
        }
    };

    return <div ref={rootRef} data-read-aloud-voice-picker data-escape-boundary={open ? '' : undefined} className="relative shrink-0" onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            if (!savingId) close(true);
        }
    }}>
        <button ref={toggleRef} type="button" disabled={!!savingId} onClick={() => { setOpen((current) => !current); setQuery(''); setSelectionError(''); }} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }} aria-label={`Change voice${activeVoice?.name ? `, ${activeVoice.name}` : ''}`} title="Change voice" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} className="relative block h-14 w-14 rounded-xl border border-slate-700 bg-slate-800 shadow-lg transition hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-wait">
            <span className="block h-full w-full overflow-hidden rounded-xl"><VoiceAvatar key={activeVoice?.id || 'unselected'} voice={activeVoice} /></span>
            <span className="absolute -bottom-1 -right-1 rounded-full border border-slate-700 bg-slate-900 p-0.5"><ChevronDown className="h-3 w-3 text-slate-200" aria-hidden="true" /></span>
        </button>
        {open && <div style={{ left: position.left, maxHeight: position.maxHeight }} className={`absolute z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-3 text-gray-900 shadow-xl ${position.placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
            <label htmlFor={searchId} className="sr-only">Search voices</label>
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" /><input ref={searchRef} id={searchId} value={query} disabled={!!savingId} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && filteredVoices.length && !loading) {
                    event.preventDefault();
                    optionsRef.current[event.key === 'ArrowDown' ? 0 : filteredVoices.length - 1]?.focus();
                }
            }} type="search" placeholder="Search voices" className="h-11 min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 sm:text-sm" /></div>
            <div id={listId} role="listbox" aria-label="Read-aloud voices" className="mt-2 min-h-0 max-h-64 space-y-1 overflow-y-auto overscroll-contain">
                {loading ? <p role="status" className="flex items-center gap-2 px-1 py-4 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading voices...</p> : filteredVoices.length ? filteredVoices.map((voice, index) => <button key={voice.id} ref={(node) => { optionsRef.current[index] = node; }} type="button" role="option" aria-selected={voice.id === activeVoiceId} disabled={!!savingId} onClick={() => void choose(voice)} onKeyDown={(event) => {
                    const moves = { ArrowDown: (index + 1) % filteredVoices.length, ArrowUp: (index + filteredVoices.length - 1) % filteredVoices.length, Home: 0, End: filteredVoices.length - 1 };
                    if (event.key in moves) { event.preventDefault(); optionsRef.current[moves[event.key]]?.focus(); }
                }} className={`flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-wait ${voice.id === activeVoiceId ? 'bg-blue-50 text-blue-800' : 'text-gray-800 hover:bg-gray-50'}`}>
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full"><VoiceAvatar voice={voice} /></span>
                    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{voice.name}</span>{voice.languages?.length ? <span className="mt-0.5 block text-xs text-gray-500">{voice.languages.join(', ')}</span> : null}</span>
                    {savingId === voice.id ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-blue-600 motion-reduce:animate-none" aria-label="Saving voice" /> : voice.id === activeVoiceId ? <Check className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" /> : null}
                </button>) : !error && <p className="px-1 py-4 text-sm text-gray-500">{needle ? 'No voices match your search.' : 'No voices available.'}</p>}
            </div>
            {(error || selectionError) && <div className="mt-3 space-y-2"><p role="alert" className="text-sm text-red-700">{selectionError || error}</p>{error && <button type="button" disabled={loading || !!savingId} onClick={() => onRetry?.()} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Retry voices</button>}</div>}
        </div>}
    </div>;
};

export default ReadAloudVoicePicker;
