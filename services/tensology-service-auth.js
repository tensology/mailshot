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

const hasAnyMailScope = (scopes) => Array.isArray(scopes) && scopes.some((scope) => typeof scope === 'string' && scope.startsWith('mail.'));

/**
 * Admission check for introspected Tensology credentials.
 * - audience=mailshot: admitted with any mail.* scope (mail.service = full authority;
 *   narrower keys are then gated per route by requireScope / requireReadScope).
 * - audience=decisionsai: admitted with any mail.* scope (unchanged).
 */
export const isAdmittedServiceIdentity = (identity) => {
    if (!identity || !identity.active) return false;
    if (identity.audience === 'mailshot' || identity.audience === 'decisionsai') return hasAnyMailScope(identity.scopes);
    return false;
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
        if (!result.ok || !identity?.active || !isAdmittedServiceIdentity(identity)) {
            return response.status(403).json({ error: { code: 'forbidden', message: 'Invalid Mailshot service credential' } });
        }
        cache.set(rawKey, { identity, expiresAt: Date.now() + CACHE_MS });
        request.tensologyService = identity;
        return next();
    } catch (error) {
        return response.status(502).json({ error: { code: 'authority_unavailable', message: error.message || 'Tensology is unavailable' } });
    }
};

export const hasMailStateScope = (identity = {}) => {
    const scopes = Array.isArray(identity.scopes) ? identity.scopes : [];
    return identity.audience === 'mailshot' && scopes.includes('mail.service');
};

export const requireMailStateScope = (request, response, next) => {
    if (!hasMailStateScope(request.tensologyService)) {
        return response.status(403).json({
            error: {
                code: 'insufficient_scope',
                message: 'Changing message state requires Mailshot service authority.'
            }
        });
    }
    return next();
};

/**
 * Require one integration scope on the introspected credential.
 * The first-party Mailshot service credential (audience=mailshot + mail.service)
 * keeps full authority; Tensology Incoming replies are sent with it.
 */
export const requireScope = (scope) => (request, response, next) => {
    const identity = request.tensologyService || {};
    const scopes = Array.isArray(identity.scopes) ? identity.scopes : [];
    if (hasMailStateScope(identity) || scopes.includes(scope)) return next();
    return response.status(403).json({
        data: null,
        error: {
            code: 'insufficient_scope',
            message: `This API key does not grant ${scope}.`,
            required: [scope]
        },
        meta: {}
    });
};

/**
 * Read routes require mail.read for scoped Mailshot-audience keys.
 * mail.service keeps full authority, and DecisionsAI keys keep their existing
 * behaviour (admitted with any mail.* scope) so current callers are not locked out.
 */
export const requireReadScope = (request, response, next) => {
    const identity = request.tensologyService || {};
    if (identity.audience !== 'mailshot') return next();
    return requireScope('mail.read')(request, response, next);
};
