import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAddressListLabel, parseAddressList } from './emailFormatter.js';

test('parseAddressList extracts names and emails from comma separated senders', () => {
    assert.deepEqual(parseAddressList('Steve Hadd <steve@gmail.com>, Martin Snyman <martin@example.com>').map((item) => ({
        name: item.name,
        email: item.email,
        label: item.label
    })), [
        { name: 'Steve Hadd', email: 'steve@gmail.com', label: 'Steve Hadd' },
        { name: 'Martin Snyman', email: 'martin@example.com', label: 'Martin Snyman' }
    ]);
});

test('formatAddressListLabel collapses long address lists', () => {
    assert.equal(formatAddressListLabel('steve@gmail.com, Martin Snyman <martin@example.com>, Neil <neil@example.com>'), 'steve, Martin Snyman +1');
});
