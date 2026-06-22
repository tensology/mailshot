export const API_URLS = {
    authLogin: {
        endpoint: 'auth/login',
        method: 'POST'
    },
    authLogout: {
        endpoint: 'auth/logout',
        method: 'POST'
    },
    authMe: {
        endpoint: 'auth/me',
        method: 'GET'
    },
    getSettings: {
        endpoint: 'settings',
        method: 'GET',
        pathBuilder: () => 'settings'
    },
    updateGeneralSettings: {
        endpoint: 'settings/general',
        method: 'PUT',
        pathBuilder: () => 'settings/general'
    },
    updateAiSettings: {
        endpoint: 'settings/ai',
        method: 'PUT',
        pathBuilder: () => 'settings/ai'
    },
    updateTtsSettings: {
        endpoint: 'settings/tts',
        method: 'PUT',
        pathBuilder: () => 'settings/tts'
    },
    fetchAiModels: {
        endpoint: 'settings/ai/models',
        method: 'POST',
        pathBuilder: () => 'settings/ai/models'
    },
    sendEmail: {
        endpoint: 'send',
        method: 'POST',
        isMultipart: true
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
    getMailboxCounts: {
        endpoint: 'emails/counts',
        method: 'GET',
        pathBuilder: () => 'emails/counts'
    },
    getEmailById: {
        endpoint: 'email',
        method: 'GET',
        pathBuilder: (id) => `email/${id}`
    },
    getEmailThread: {
        endpoint: 'email',
        method: 'GET',
        pathBuilder: (path) => `email/${path}`
    },
    startReadAloud: {
        endpoint: 'email',
        method: 'POST',
        pathBuilder: (id) => `email/${id}/read-aloud`
    },
    getReadAloudJob: {
        endpoint: 'read-aloud',
        method: 'GET',
        pathBuilder: (jobId) => `read-aloud/${jobId}`
    },
    searchEmails: {
        endpoint: 'emails/search',
        method: 'GET',
        pathBuilder: () => 'emails/search'
    },
    downloadAttachment: {
        endpoint: 'email',
        method: 'GET',
        pathBuilder: (path) => `email/${path}`,
        responseType: 'blob'
    },
    toggleStarredMails: {
        endpoint: 'starred',
        method: 'POST'
    },
    toggleReadMail: {
        endpoint: 'read',
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
    restoreEmailsFromBin: {
        endpoint: 'bin/restore',
        method: 'POST'
    },
    archiveEmails: {
        endpoint: 'archive',
        method: 'POST'
    },
    markSpamEmails: {
        endpoint: 'spam',
        method: 'POST'
    },
    syncMailbox: {
        endpoint: 'sync',
        method: 'POST'
    },
    startSummarizeAll: {
        endpoint: 'emails/summarize-all',
        method: 'POST',
        pathBuilder: () => 'emails/summarize-all'
    },
    getSummarizeAllStatus: {
        endpoint: 'emails/summarize-all/status',
        method: 'GET',
        pathBuilder: () => 'emails/summarize-all/status'
    },
    getLabels: {
        endpoint: 'labels',
        method: 'GET',
        pathBuilder: () => 'labels'
    },
    createLabel: {
        endpoint: 'labels',
        method: 'POST',
        pathBuilder: () => 'labels'
    },
    updateLabel: {
        endpoint: 'labels',
        method: 'PUT',
        pathBuilder: (id) => `labels/${id}`
    },
    deleteLabel: {
        endpoint: 'labels',
        method: 'DELETE',
        pathBuilder: (id) => `labels/${id}`
    },
    updateEmailLabels: {
        endpoint: 'email',
        method: 'POST',
        pathBuilder: (path) => `email/${path}`
    },
    moveEmailsToLabel: {
        endpoint: 'move-to-label',
        method: 'POST',
        pathBuilder: () => 'move-to-label'
    },
    getLabelRules: {
        endpoint: 'label-rules',
        method: 'GET',
        pathBuilder: () => 'label-rules'
    },
    createLabelRule: {
        endpoint: 'label-rules',
        method: 'POST',
        pathBuilder: () => 'label-rules'
    },
    getContacts: {
        endpoint: 'contacts',
        method: 'GET',
        pathBuilder: () => 'contacts'
    },
    getContactById: {
        endpoint: 'contacts',
        method: 'GET',
        pathBuilder: (id) => `contacts/${id}`
    },
    createContact: {
        endpoint: 'contacts',
        method: 'POST',
        pathBuilder: () => 'contacts'
    },
    updateContact: {
        endpoint: 'contacts',
        method: 'PUT',
        pathBuilder: (id) => `contacts/${id}`
    },
    deleteContact: {
        endpoint: 'contacts',
        method: 'DELETE',
        pathBuilder: (id) => `contacts/${id}`
    }
};
