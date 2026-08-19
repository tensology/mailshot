const editableTagNames = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export const hasActiveMailSelection = ({ selectedEmails = [], allMatchingSelected = false } = {}) => (
    allMatchingSelected || selectedEmails.length > 0
);

export const getDeleteSelectionIds = ({
    selectedEmails = [],
    deleteTargetIds = [],
    allMatchingSelected = false
} = {}) => {
    if (deleteTargetIds.length) {
        return deleteTargetIds;
    }

    return allMatchingSelected ? [] : selectedEmails;
};

export const getArchiveToggleAction = (activeTab = '') => {
    const archived = activeTab === 'archived';
    return {
        archived,
        label: archived ? 'Unarchive' : 'Archive',
        pastTense: archived ? 'unarchived' : 'archived'
    };
};

export const buildReadTogglePayload = ({
    selectedEmails = [],
    allMatchingSelected = false,
    scope = null,
    value
} = {}) => {
    const read = Boolean(value);
    if (allMatchingSelected) {
        return { scope, value: read };
    }
    return { ids: selectedEmails, value: read };
};

/** When searching, default to everywhere; optional toggle limits to the open section. */
export const resolveSearchMailboxType = ({
    searchFilter = '',
    sectionOnly = false,
    activeTab = 'inbox'
} = {}) => {
    if (!String(searchFilter || '').trim()) {
        return activeTab || 'inbox';
    }
    return sectionOnly ? (activeTab || 'inbox') : 'everywhere';
};

export const getSectionOnlySearchLabel = (activeTab = 'inbox', tabTitles = {}) => {
    const sectionName = tabTitles[activeTab] || 'Section';
    return `${sectionName} only`;
};

/** Best mailbox route for opening a message from mixed search results. */
export const getEmailMailboxType = (email = {}) => {
    if (email.bin) {
        return 'bin';
    }
    if (email.spam) {
        return 'spam';
    }
    if (email.archived) {
        return 'archived';
    }
    if (email.type === 'drafts' || email.type === 'sent') {
        return email.type;
    }
    return 'inbox';
};

export const isDeleteKeyboardShortcut = (event) => {
    if (!event || (event.key !== 'Delete' && event.key !== 'Backspace')) {
        return false;
    }

    const target = event.target;
    const tagName = target?.tagName;
    return !target?.isContentEditable && !editableTagNames.has(tagName);
};
