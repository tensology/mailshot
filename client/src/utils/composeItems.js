// Composer dock helpers: at most one composer per saved draft id.

export const draftKey = (draft = {}) => {
    const id = draft?._id;
    return id === undefined || id === null || id === '' ? null : String(id);
};

// Returns the next composeItems list. If a composer is already open for this
// draft, it is restored (un-minimised) and moved to the front of the dock
// instead of opening a second one. Safe under React's functional updates, so
// a fast double-click that resolves twice still yields a single composer.
export const upsertDraftComposer = (items, nextDraft, createItem) => {
    const key = draftKey(nextDraft);
    const existing = key ? items.find((item) => draftKey(item.draft) === key) : null;
    if (!existing) {
        return [...items, createItem(nextDraft)];
    }
    const restored = {
        ...existing,
        composeState: existing.composeState === 'minimized' ? 'normal' : existing.composeState
    };
    return [...items.filter((item) => item !== existing), restored];
};
