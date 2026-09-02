import assert from 'node:assert/strict';
import test from 'node:test';

import { createDraftSaveQueue } from './draftSaveQueue.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

test('serializes saves and coalesces queued silent saves to the latest state', async () => {
    const gate = deferred();
    const calls = [];
    const queue = createDraftSaveQueue();
    const run = (value) => async () => {
        calls.push(value);
        if (value === 'first') {
            await gate.promise;
        }
        return value;
    };

    const first = queue.enqueue(run('first'), { coalesce: true });
    const replaced = queue.enqueue(run('replaced'), { coalesce: true });
    const latest = queue.enqueue(run('latest'), { coalesce: true });
    assert.deepEqual(calls, ['first']);

    gate.resolve();
    assert.equal(await first, 'first');
    assert.equal(await replaced, 'latest');
    assert.equal(await latest, 'latest');
    assert.deepEqual(calls, ['first', 'latest']);
});

test('runs an explicit save after the active request without coalescing it', async () => {
    const gate = deferred();
    const calls = [];
    const queue = createDraftSaveQueue();
    const first = queue.enqueue(async () => {
        calls.push('active');
        await gate.promise;
    }, { coalesce: true });
    const explicit = queue.enqueue(async () => {
        calls.push('close-state');
        return 'saved';
    });

    assert.deepEqual(calls, ['active']);
    gate.resolve();
    await first;
    assert.equal(await explicit, 'saved');
    assert.deepEqual(calls, ['active', 'close-state']);
});

test('cancels a pending autosave and runs send exclusively after the active save', async () => {
    const gate = deferred();
    const calls = [];
    const queue = createDraftSaveQueue();
    const active = queue.enqueue(async () => {
        calls.push('active-save');
        await gate.promise;
    }, { coalesce: true });
    const cancelledAutosave = queue.enqueue(async () => {
        calls.push('stale-autosave');
    }, { coalesce: true });
    const send = queue.enqueueExclusive(async () => {
        calls.push('send');
        queue.close();
        return 'sent';
    });

    assert.deepEqual(calls, ['active-save']);
    gate.resolve();
    await active;
    assert.deepEqual(await cancelledAutosave, { cancelled: true });
    assert.equal(await send, 'sent');
    assert.deepEqual(calls, ['active-save', 'send']);

    assert.deepEqual(
        await queue.enqueue(async () => calls.push('late-save'), { coalesce: true }),
        { cancelled: true }
    );
    assert.deepEqual(calls, ['active-save', 'send']);
});

test('keeps the queue open when an exclusive send task fails', async () => {
    const calls = [];
    const queue = createDraftSaveQueue();
    const result = await queue.enqueueExclusive(async () => {
        calls.push('failed-send');
        return { error: 'network error' };
    });
    await queue.enqueue(async () => calls.push('later-autosave'), { coalesce: true });

    assert.deepEqual(result, { error: 'network error' });
    assert.deepEqual(calls, ['failed-send', 'later-autosave']);
});
