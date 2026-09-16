import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    applyContactSuggestion,
    cleanContactName,
    contactMatchesQuery,
    filterContactSuggestions,
    getActiveRecipientQuery
} from './contactSuggestions.js';

test('cleans quoted contact display names', () => {
    assert.equal(cleanContactName("'Roland Von Hoesslin'"), 'Roland Von Hoesslin');
    assert.equal(cleanContactName('"simon"'), 'simon');
});

test('active recipient query is the last unfinished token', () => {
    assert.equal(getActiveRecipientQuery('a@b.com, rol'), 'rol');
    assert.equal(getActiveRecipientQuery('rol'), 'rol');
    assert.equal(getActiveRecipientQuery(''), '');
});

test('contact match looks at name and email', () => {
    const contact = { name: "'Roland Von Hoesslin'", email: 'roland@themagicdragon.co.za' };
    assert.equal(contactMatchesQuery(contact, 'rola'), true);
    assert.equal(contactMatchesQuery(contact, 'magicdragon'), true);
    assert.equal(contactMatchesQuery(contact, 'zzz'), false);
    assert.equal(contactMatchesQuery(contact, ''), false);
});

test('suggestions stay empty until there is a query', () => {
    const contacts = [
        { _id: '1', name: 'Roland', email: 'roland@themagicdragon.co.za' },
        { _id: '2', name: 'Simon', email: 'simon@crystallogic.co.za' }
    ];
    assert.deepEqual(filterContactSuggestions(contacts, ''), []);
    assert.equal(filterContactSuggestions(contacts, 'si').length, 1);
    assert.equal(filterContactSuggestions(contacts, 'si')[0].email, 'simon@crystallogic.co.za');
});

test('applying a suggestion replaces only the active token', () => {
    assert.equal(
        applyContactSuggestion('a@b.com, rol', { email: 'roland@themagicdragon.co.za' }),
        'a@b.com, roland@themagicdragon.co.za'
    );
    assert.equal(
        applyContactSuggestion('rol', { email: 'roland@themagicdragon.co.za' }),
        'roland@themagicdragon.co.za'
    );
});
