export const createDraftSaveQueue = () => {
    const pending = [];
    let active = false;
    let closed = false;
    const cancelledResult = { cancelled: true };

    const cancelPending = ({ coalescedOnly = false } = {}) => {
        const retained = [];
        pending.forEach((entry) => {
            if (coalescedOnly && !entry.coalesce) {
                retained.push(entry);
                return;
            }
            entry.waiters.forEach(({ resolve }) => resolve(cancelledResult));
        });
        pending.splice(0, pending.length, ...retained);
    };

    const drain = async () => {
        if (active || !pending.length) {
            return;
        }

        active = true;
        const entry = pending.shift();
        try {
            const result = await entry.task();
            entry.waiters.forEach(({ resolve }) => resolve(result));
        } catch (error) {
            entry.waiters.forEach(({ reject }) => reject(error));
        } finally {
            active = false;
            drain();
        }
    };

    const queue = {
        enqueue(task, { coalesce = false } = {}) {
            if (closed) {
                return Promise.resolve(cancelledResult);
            }
            return new Promise((resolve, reject) => {
                const existing = coalesce
                    ? pending.find((entry) => entry.coalesce)
                    : undefined;
                if (existing) {
                    existing.task = task;
                    existing.waiters.push({ resolve, reject });
                } else {
                    pending.push({ task, coalesce, waiters: [{ resolve, reject }] });
                }
                drain();
            });
        },
        enqueueExclusive(task) {
            cancelPending({ coalescedOnly: true });
            return queue.enqueue(task);
        },
        close() {
            closed = true;
            cancelPending();
        }
    };

    return queue;
};
