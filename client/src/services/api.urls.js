export const API_URLS = {
    sendEmail: {
        endpoint: 'send',
        method: 'POST'
    },
    saveSentEmails: {
        endpoint: 'save',
        method: 'POST'
    },
    saveDraftEmails: {
        endpoint: 'save-draft',
        method: 'POST'
    },
    getEmailFromType: {
        endpoint: 'emails',
        method: 'GET'
    },
    toggleStarredMails: {
        endpoint: 'starred',
        method: 'POST'
    },
    deleteEmails: {
        endpoint: 'delete',
        method: 'DELETE'
    },
    moveEmailsToBin: {
        endpoint: 'bin',
        method: 'POST'
    },
    syncMailbox: {
        endpoint: 'sync',
        method: 'POST'
    }
}
