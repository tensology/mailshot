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

export const isDeleteKeyboardShortcut = (event) => {
    if (!event || (event.key !== 'Delete' && event.key !== 'Backspace')) {
        return false;
    }

    const target = event.target;
    const tagName = target?.tagName;
    return !target?.isContentEditable && !editableTagNames.has(tagName);
};
