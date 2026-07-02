const MAILBOX_INDEX_UNAVAILABLE_MESSAGE = 'Mailbox index unavailable. Archived or deleted state may be stale until the database is restored.';

export const getMailboxIndexAvailability = ({ dbConnected, dbQueryFailed }) => {
    if (!dbConnected || dbQueryFailed) {
        return {
            available: false,
            message: MAILBOX_INDEX_UNAVAILABLE_MESSAGE
        };
    }

    return {
        available: true,
        message: ''
    };
};

export { MAILBOX_INDEX_UNAVAILABLE_MESSAGE };
