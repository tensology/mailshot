import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfilePhoto } from './profilePhoto.js';

test('uses the Tensology portrait for Paul, including display names and case differences', () => {
    assert.equal(getProfilePhoto('paul@tensology.com'), '/paul-profile.webp');
    assert.equal(getProfilePhoto('Paul Hoft <Paul@Tensology.com>'), '/paul-profile.webp');
});

test('does not assign Paul’s portrait to another sender or a similar-looking address', () => {
    for (const address of ['', 'sender@example.com', 'all@tensology.co.za', 'paul@tensology.com.example.com']) {
        assert.equal(getProfilePhoto(address), '');
    }
});
