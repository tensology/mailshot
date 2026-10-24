import test from 'node:test';
import assert from 'node:assert/strict';

import { extractAddress, findSenderIdentity, formatSender, loadSenderIdentities } from './sender-identities.js';

const fileWith = (identities) => () => JSON.stringify({ identities });

test('primary SMTP mailbox is the only sending identity by default', () => {
    const identities = loadSenderIdentities({
        env: { MAIL_FROM: 'Paul@Tensology.com', MAIL_NAME: 'Paul' },
        readFile: fileWith([{ email: 'all@tensology.co.za', name: 'Tensology', can_send: false }])
    });
    assert.deepEqual(identities.map((i) => [i.email, i.primary, i.can_send]), [
        ['paul@tensology.com', true, true],
        ['all@tensology.co.za', false, false]
    ]);
});

test('extra identities never become sendable unless can_send is literally true', () => {
    const identities = loadSenderIdentities({ env: { MAIL_FROM: 'a@x.com' }, readFile: fileWith([{ email: 'b@x.com', can_send: 'yes' }]) });
    assert.equal(identities[1].can_send, false);
});

test('duplicates, junk and env list are handled', () => {
    const identities = loadSenderIdentities({
        env: { MAIL_FROM: 'a@x.com', MAILSHOT_SENDER_IDENTITIES: 'c@x.com, not-an-email, A@X.com' },
        readFile: () => 'not json'
    });
    assert.deepEqual(identities.map((i) => i.email), ['a@x.com', 'c@x.com']);
});

test('lookup accepts display-name forms and rejects unknown senders', () => {
    const identities = loadSenderIdentities({ env: { MAIL_FROM: 'a@x.com' }, readFile: fileWith([{ email: 'all@tensology.co.za', name: 'Tensology' }]) });
    assert.equal(extractAddress('"Tensology" <ALL@tensology.co.za>'), 'all@tensology.co.za');
    assert.equal(findSenderIdentity('Tensology <all@tensology.co.za>', identities).email, 'all@tensology.co.za');
    assert.equal(findSenderIdentity('all@tensology.com', identities), null);
    assert.equal(formatSender(identities[1]), '"Tensology" <all@tensology.co.za>');
});

test('repository config ships all@tensology.co.za as a draft-only identity', () => {
    const identities = loadSenderIdentities({ env: { MAIL_FROM: 'Paul@Tensology.com' } });
    const all = identities.find((i) => i.email === 'all@tensology.co.za');
    assert.ok(all);
    assert.equal(all.can_send, false);
});
