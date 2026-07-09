const MAX_FIELD_LENGTH = 180;
const STACK_LINE_LIMIT = 8;

const truncate = (value = '', limit = MAX_FIELD_LENGTH) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

export const getEmailLogContext = (email = {}) => ({
    email_id: String(email._id || ''),
    message_id: truncate(email.messageId || email.message_id || ''),
    type: String(email.type || ''),
    subject: truncate(email.subject || ''),
    from: truncate(email.from || email.from_address || ''),
    to: truncate(email.to || email.to_address || '')
});

export const getErrorLogContext = (error = {}) => ({
    name: error?.name || 'Error',
    message: truncate(error?.message || error || '', 500),
    code: error?.code || '',
    status: error?.status || error?.statusCode || '',
    stack: error?.stack
        ? String(error.stack).split('\n').slice(0, STACK_LINE_LIMIT).join('\n')
        : ''
});

export const logPipelineEvent = (event, details = {}, level = 'info') => {
    const payload = {
        ts: new Date().toISOString(),
        event,
        ...details
    };
    const logger = typeof console[level] === 'function' ? console[level] : console.info;
    logger(`[mailshot:${event}] ${JSON.stringify(payload)}`);
};
