import Label from '../model/label.js';
import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';
import { findEmailRecord, updateCachedEmail, getCachedEmails, saveMailboxCacheToDisk } from '../services/mail-sync.js';
import { resolveBulkEmailSelection } from './email-controller.js';
import {
    getCachedLabels,
    createCachedLabel,
    updateCachedLabel,
    deleteCachedLabel,
    ensureCachedLabel,
    getLabelBySlug
} from '../services/label-store.js';
import { createLabelRules, extractEmailAddress, getLabelRules } from '../services/label-rule-store.js';
import { slugify } from '../utils/slug.js';
import { isMailboxStoreReady, getMailboxPool, getMailboxRepository } from '../services/postgres-mailbox-store.js';
import { createPostgresLabelStore } from '../services/postgres-metadata-store.js';

const RESERVED_LABEL_SLUGS = new Set(['archived', 'archive', 'spam']);
const visibleLabels = (labels = []) => labels.filter((label) => !RESERVED_LABEL_SLUGS.has(label.slug));
let postgresLabelStore = null;

const getPostgresLabelStore = () => {
    if (!isMailboxStoreReady()) {
        return null;
    }

    if (!postgresLabelStore) {
        postgresLabelStore = createPostgresLabelStore({
            pool: getMailboxPool(),
            getCachedLabels
        });
    }

    return postgresLabelStore;
};

export const getLabels = async (_, response) => {
    try {
        const postgresStore = getPostgresLabelStore();
        if (postgresStore) {
            return response.status(200).json(visibleLabels(await postgresStore.list()));
        }

        if (!isDbConnected()) {
            return response.status(200).json(visibleLabels(getCachedLabels()));
        }

        const labels = await Label.find().sort({ name: 1 });
        response.status(200).json(visibleLabels(labels));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const createLabel = async (request, response) => {
    try {
        const name = String(request.body.name || '').trim();
        if (!name) {
            return response.status(400).json('Label name is required');
        }

        const slug = slugify(request.body.slug || name);
        if (RESERVED_LABEL_SLUGS.has(slug)) {
            return response.status(400).json('That name is reserved for a system mailbox');
        }

        const postgresStore = getPostgresLabelStore();
        if (postgresStore) {
            const label = await postgresStore.create({
                _id: `label-${slug}`,
                name,
                color: request.body.color || '#5f6368',
                slug
            });
            return response.status(201).json(label);
        }

        if (!isDbConnected()) {
            const label = createCachedLabel({
                name,
                color: request.body.color || '#5f6368',
                slug
            });
            return response.status(201).json(label);
        }

        const label = await Label.create({
            name,
            slug,
            color: request.body.color || '#5f6368'
        });

        response.status(201).json(label);
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const updateLabel = async (request, response) => {
    try {
        const updates = {};
        if (request.body.name) updates.name = String(request.body.name).trim();
        if (request.body.color) updates.color = request.body.color;
        if (request.body.slug) updates.slug = slugify(request.body.slug);

        const postgresStore = getPostgresLabelStore();
        if (postgresStore) {
            const label = await postgresStore.update(request.params.id, updates);
            if (!label) {
                return response.status(404).json('Label not found');
            }
            return response.status(200).json(label);
        }

        if (!isDbConnected()) {
            const label = updateCachedLabel(request.params.id, updates);
            if (!label) {
                return response.status(404).json('Label not found');
            }
            return response.status(200).json(label);
        }

        const label = await Label.findByIdAndUpdate(request.params.id, { $set: updates }, { new: true });
        response.status(200).json(label);
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const deleteLabel = async (request, response) => {
    try {
        const postgresStore = getPostgresLabelStore();
        if (postgresStore) {
            const removed = await postgresStore.delete(request.params.id);
            if (!removed) {
                return response.status(404).json('Label not found');
            }

            const repository = getMailboxRepository();
            const labeled = await repository.list({ label: removed.slug });
            for (const email of labeled) {
                await repository.updateMany([email._id], {
                    labels: (email.labels || []).filter((slug) => slug !== removed.slug)
                });
            }
            return response.status(200).json('Label deleted');
        }

        if (!isDbConnected()) {
            const removed = deleteCachedLabel(request.params.id);
            if (!removed) {
                return response.status(404).json('Label not found');
            }

            getCachedEmails().forEach((email) => {
                if ((email.labels || []).includes(removed.slug)) {
                    updateCachedEmail(email._id, {
                        labels: email.labels.filter((slug) => slug !== removed.slug)
                    });
                }
            });

            return response.status(200).json('Label deleted');
        }

        const label = await Label.findById(request.params.id);
        if (!label) {
            return response.status(404).json('Label not found');
        }

        await Email.updateMany({ labels: label.slug }, { $pull: { labels: label.slug } });
        await Label.findByIdAndDelete(request.params.id);
        response.status(200).json('Label deleted');
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const updateEmailLabels = async (request, response) => {
    try {
        const labels = Array.isArray(request.body.labels) ? request.body.labels : [];
        const emailId = request.params.id;

        if (isMailboxStoreReady()) {
            const repository = getMailboxRepository();
            const email = await repository.findById(emailId);
            if (!email) {
                return response.status(404).json('Email not found');
            }
            await repository.updateMany([emailId], { labels });
            return response.status(200).json({ ...email, labels });
        }

        const resolved = await findEmailRecord(emailId);
        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        if (resolved.source === 'cache') {
            const cached = updateCachedEmail(emailId, { labels });
            return response.status(200).json(cached);
        }

        const email = await Email.findByIdAndUpdate(
            emailId,
            { $set: { labels } },
            { new: true }
        );
        if (!email) {
            return response.status(404).json('Email not found');
        }
        return response.status(200).json(email);
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const moveEmailsToLabel = async (request, response) => {
    try {
        const ids = await resolveBulkEmailSelection(request.body, 'inbox');
        const labelInput = String(request.body.label || '').trim();

        if (!ids.length || !labelInput) {
            return response.status(400).json('Email ids and label are required');
        }

        const labelSlug = slugify(labelInput);
        if (RESERVED_LABEL_SLUGS.has(labelSlug)) {
            return response.status(400).json('That name is reserved for a system mailbox');
        }

        let label = getLabelBySlug(labelSlug);

        if (!label) {
            const postgresStore = getPostgresLabelStore();
            if (postgresStore) {
                label = await postgresStore.findBySlug(labelSlug);
                if (!label) {
                    label = await postgresStore.create({
                        _id: `label-${labelSlug}`,
                        name: labelInput,
                        slug: labelSlug,
                        color: '#5f6368'
                    });
                }
            } else if (!isDbConnected()) {
                label = ensureCachedLabel(labelInput);
            } else {
                label = await Label.findOne({ slug: labelSlug });
                if (!label) {
                    label = await Label.create({
                        name: labelInput,
                        slug: labelSlug,
                        color: '#5f6368'
                    });
                }
            }
        }

        if (!label) {
            return response.status(400).json('Unknown label');
        }

        let updatedCount = 0;
        const movedSenders = new Set();

        for (const emailId of ids) {
            const resolved = isMailboxStoreReady()
                ? (() => {
                    const repository = getMailboxRepository();
                    return repository.findById(emailId).then((email) => (email ? { email, source: 'pg' } : null));
                })()
                : findEmailRecord(emailId);
            const current = await resolved;
            if (!current) {
                continue;
            }
            const sender = extractEmailAddress(current.email.from);
            if (sender) {
                movedSenders.add(sender);
            }

            const currentLabels = Array.isArray(current.email.labels) ? current.email.labels : [];
            const nextLabels = currentLabels.includes(label.slug)
                ? currentLabels
                : [...currentLabels, label.slug];

            const updates = {
                labels: nextLabels,
                in_inbox: false
            };

            if (current.email.bin) {
                updates.bin = false;
                updates.spam = false;
                updates.archived = false;
                updates.type = '';
            }

            if (current.source === 'cache') {
                if (updateCachedEmail(emailId, updates)) {
                    updatedCount += 1;
                }
                continue;
            }

            if (isMailboxStoreReady()) {
                const repository = getMailboxRepository();
                await repository.updateMany([emailId], updates);
            } else {
                await Email.findByIdAndUpdate(emailId, { $set: updates });
            }
            updatedCount += 1;
        }

        if (!isDbConnected()) {
            saveMailboxCacheToDisk();
        }

        return response.status(200).json({
            label: label.slug,
            updated: updatedCount,
            senders: [...movedSenders]
        });
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const listLabelRules = async (_, response) => {
    try {
        return response.status(200).json(await getLabelRules());
    } catch (error) {
        return response.status(500).json(error.message);
    }
};

export const createLabelRule = async (request, response) => {
    try {
        const rules = await createLabelRules({
            from: request.body.from,
            label: request.body.label
        });

        return response.status(201).json({
            created: rules.length,
            rules
        });
    } catch (error) {
        return response.status(400).json(error.message);
    }
};

export const getEmailLabels = async (request, response) => {
    try {
        const emailId = request.params.id;

        const resolved = await findEmailRecord(emailId);
        if (!resolved) {
            return response.status(404).json('Email not found');
        }

        return response.status(200).json(resolved.email.labels || []);
    } catch (error) {
        response.status(500).json(error.message);
    }
};
