import test from 'node:test';
import assert from 'node:assert/strict';
import routes from '../routes/integration-route.js';
import { isAdmittedServiceIdentity } from '../services/tensology-service-auth.js';

// Run only the scope middlewares on a matched route (skips the router-level
// introspection middleware and the final controller handler).
const authorize = async (method, path, identity) => {
    const layer = routes.stack.find((entry) => entry.route && entry.route.methods[method] && entry.match(path));
    assert.ok(layer, `no route for ${method} ${path}`);
    const handles = layer.route.stack.map((entry) => entry.handle);
    const guards = handles.slice(0, -1);
    const request = { tensologyService: identity, params: {}, headers: {} };
    let status = 200;
    const response = { status(code) { status = code; return this; }, json() { return this; } };
    for (const guard of guards) {
        let passed = false;
        await guard(request, response, () => { passed = true; });
        if (!passed) return status;
    }
    return 200;
};

const scoped = { active: true, audience: 'mailshot', scopes: ['mail.read', 'mail.drafts.write'] };
const service = { active: true, audience: 'mailshot', scopes: ['mail.service'] };
const decisionsDrafts = { active: true, audience: 'decisionsai', scopes: ['mail.drafts.write'] };
const decisionsFull = { active: true, audience: 'decisionsai', scopes: ['mail.read', 'mail.drafts.read', 'mail.drafts.write', 'mail.send', 'mail.manage'] };

const reads = ['/messages', '/search', '/labels', '/senders', '/messages/abc', '/drafts', '/drafts/abc'];

test('admission: mailshot keys with any mail.* scope are admitted; no mail.* scope is rejected', () => {
    assert.equal(isAdmittedServiceIdentity(scoped), true);
    assert.equal(isAdmittedServiceIdentity(service), true);
    assert.equal(isAdmittedServiceIdentity({ active: true, audience: 'mailshot', scopes: [] }), false);
    assert.equal(isAdmittedServiceIdentity({ active: true, audience: 'mailshot', scopes: ['customers.read'] }), false);
    assert.equal(isAdmittedServiceIdentity({ active: true, audience: 'decisionsai', scopes: ['projects.read'] }), false);
    assert.equal(isAdmittedServiceIdentity({ active: false, audience: 'mailshot', scopes: ['mail.service'] }), false);
    assert.equal(isAdmittedServiceIdentity({ active: true, audience: 'other', scopes: ['mail.service'] }), false);
});

test('admission: decisionsai unchanged (any mail.* scope)', () => {
    assert.equal(isAdmittedServiceIdentity(decisionsDrafts), true);
    assert.equal(isAdmittedServiceIdentity(decisionsFull), true);
});

test('scoped mailshot key (mail.read + mail.drafts.write) can read and write drafts only', async () => {
    for (const path of reads) assert.equal(await authorize('get', path, scoped), 200, path);
    assert.equal(await authorize('post', '/drafts', scoped), 200);
    assert.equal(await authorize('patch', '/drafts/abc', scoped), 200);
    assert.equal(await authorize('delete', '/drafts/abc', scoped), 200);
    assert.equal(await authorize('put', '/messages/abc/labels', scoped), 403);
    assert.equal(await authorize('delete', '/messages/abc', scoped), 403);
    assert.equal(await authorize('post', '/send', scoped), 403);
    assert.equal(await authorize('patch', '/messages/abc/state', scoped), 403);
});

test('mailshot key without mail.read cannot read', async () => {
    const draftsOnly = { active: true, audience: 'mailshot', scopes: ['mail.drafts.write'] };
    for (const path of reads) assert.equal(await authorize('get', path, draftsOnly), 403, path);
    assert.equal(await authorize('post', '/drafts', draftsOnly), 200);
});

test('mail.service still passes every route', async () => {
    for (const path of reads) assert.equal(await authorize('get', path, service), 200, path);
    for (const [method, path] of [['post', '/drafts'], ['patch', '/drafts/a'], ['delete', '/drafts/a'], ['put', '/messages/a/labels'], ['delete', '/messages/a'], ['post', '/send'], ['patch', '/messages/a/state']]) {
        assert.equal(await authorize(method, path, service), 200, `${method} ${path}`);
    }
});

test('decisionsai behaviour unchanged: reads open to any mail.* key, writes per scope, state denied', async () => {
    for (const path of reads) assert.equal(await authorize('get', path, decisionsDrafts), 200, path);
    assert.equal(await authorize('post', '/drafts', decisionsDrafts), 200);
    assert.equal(await authorize('post', '/send', decisionsDrafts), 403);
    assert.equal(await authorize('put', '/messages/a/labels', decisionsDrafts), 403);
    for (const path of reads) assert.equal(await authorize('get', path, decisionsFull), 200, path);
    assert.equal(await authorize('post', '/send', decisionsFull), 200);
    assert.equal(await authorize('put', '/messages/a/labels', decisionsFull), 200);
    assert.equal(await authorize('delete', '/messages/a', decisionsFull), 200);
    assert.equal(await authorize('patch', '/messages/a/state', decisionsFull), 403);
});
