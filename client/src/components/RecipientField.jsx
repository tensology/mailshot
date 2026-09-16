import { useEffect, useId, useRef, useState } from 'react';
import {
    applyContactSuggestion,
    cleanContactName,
    filterContactSuggestions,
    getActiveRecipientQuery
} from '../utils/contactSuggestions';

const RecipientField = ({
    name,
    label,
    value,
    onChange,
    contacts = []
}) => {
    const listId = useId();
    const rootRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const query = getActiveRecipientQuery(value);
    const suggestions = open ? filterContactSuggestions(contacts, query) : [];

    useEffect(() => {
        setActiveIndex(0);
    }, [query, open]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const onPointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    const chooseSuggestion = (contact) => {
        const nextValue = applyContactSuggestion(value, contact);
        onChange({ target: { name, value: nextValue } });
        setOpen(false);
    };

    const onInputChange = (event) => {
        onChange(event);
        setOpen(Boolean(getActiveRecipientQuery(event.target.value)));
    };

    const onKeyDown = (event) => {
        if (!suggestions.length) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % suggestions.length);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
            return;
        }

        if (event.key === 'Enter' && open) {
            event.preventDefault();
            chooseSuggestion(suggestions[activeIndex] || suggestions[0]);
            return;
        }

        if (event.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div ref={rootRef} className="relative flex min-w-0 flex-1 items-center gap-2">
            <span className="w-8 shrink-0 text-xs text-slate-500">{label}</span>
            <div className="relative min-w-0 flex-1">
                <input
                    name={name}
                    value={value}
                    onChange={onInputChange}
                    onFocus={() => setOpen(Boolean(query))}
                    onKeyDown={onKeyDown}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={suggestions.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                />
                {suggestions.length > 0 && (
                    <ul
                        id={listId}
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    >
                        {suggestions.map((contact, index) => {
                            const displayName = cleanContactName(contact.name);
                            const isActive = index === activeIndex;
                            return (
                                <li key={contact._id || contact.email}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={isActive}
                                        className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                                            isActive ? 'bg-blue-50 text-blue-900' : 'text-slate-800 hover:bg-slate-50'
                                        }`}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => chooseSuggestion(contact)}
                                    >
                                        <span className="font-medium">{displayName || contact.email}</span>
                                        {displayName ? (
                                            <span className="text-xs text-slate-500">{contact.email}</span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default RecipientField;
