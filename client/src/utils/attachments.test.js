import assert from 'node:assert/strict';
import test from 'node:test';

import { getVisibleAttachments } from './attachments.js';

test('visible attachments are scoped to one email and deduplicated', () => {
    const attachments = getVisibleAttachments({
        _id: 'email-1',
        attachments: [
            {
                attachment_id: 'a1',
                filename: 'Payment.pdf',
                size: 68608,
                content_type: 'application/pdf'
            },
            {
                attachment_id: 'a2',
                filename: 'Payment.pdf',
                size: 68608,
                content_type: 'application/pdf'
            }
        ]
    });

    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].attachment_id, 'a1');
    assert.equal(attachments[0].emailId, 'email-1');
});
