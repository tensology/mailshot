import { getSettings, loadSettingsFromDisk } from './settings-store.js';

const cache = new Map();
const CACHE_MS = 60_000;

const withDeploymentFallback = (configured = {}) => ({
    ...configured,
    enabled: configured.enabled || String(process.env.TENSOLOGY_API_ENABLED || '').toLowerCase() === 'true',
    base_url: configured.base_url || process.env.TENSOLOGY_API_URL || 'https://www.tensology.com'
});

const extractBearer = (request) => {
    const header = String(request.headers.authorization || '');
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export const requireTensologyService = async (request, response, next) => {
    const rawKey = extractBearer(request);
    if (!rawKey) return response.status(401).json({ error: { code: 'unauthorized', message: 'Service API key required' } });
    let settings = await getSettings();
    let configured = withDeploymentFallback(settings.tensology);
    // Settings can be provisioned by an installer or deployment process while
    // Mailshot is already running. Refresh the encrypted disk cache once before
    // reporting an unavailable integration so a restart is not required.
    if (!configured.enabled || !configured.base_url) {
        loadSettingsFromDisk();
        settings = await getSettings();
        configured = withDeploymentFallback(settings.tensology);
    }
    if (!configured.enabled || !configured.base_url) {
        return response.status(503).json({ error: { code: 'not_configured', message: 'Tensology integration is not configured' } });
    }
    const cached = cache.get(rawKey);
    if (cached && cached.expiresAt > Date.now()) {
        request.tensologyService = cached.identity;
        return next();
    }
    try {
        const result = await fetch(`${configured.base_url}/api/integrations/v1/auth/introspect`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${rawKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        const body = await result.json().catch(() => ({}));
        const identity = body?.data;
        const isMailshotService = identity?.audience === 'mailshot' && identity.scopes?.includes('mail.service');
        const isDecisionsMail = identity?.audience === 'decisionsai' && identity.scopes?.some((scope) => scope.startsWith('mail.'));
        if (!result.ok || !identity?.active || (!isMailshotService && !isDecisionsMail)) {
            return response.status(403).json({ error: { code: 'forbidden', message: 'Invalid Mailshot service credential' } });
        }
        cache.set(rawKey, { identity, expiresAt: Date.now() + CACHE_MS });
        request.tensologyService = identity;
        return next();
    } catch (error) {
        return response.status(502).json({ error: { code: 'authority_unavailable', message: error.message || 'Tensology is unavailable' } });
    }
};
