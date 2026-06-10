import Label from '../model/label.js';
import Email from '../model/email.js';
import { isDbConnected } from '../database/db.js';
import { findEmailRecord, updateCachedEmail, getCachedEmails, saveMailboxCacheToDisk } from '../services/mail-sync.js';
import {
    getCachedLabels,
    createCachedLabel,
    updateCachedLabel,
    deleteCachedLabel,
    ensureCachedLabel,
    getLabelBySlug
} from '../services/label-store.js';
import { slugify } from '../utils/slug.js';

export const getLabels = async (_, response) => {
    try {
        if (!isDbConnected()) {
            return response.status(200).json(getCachedLabels());
        }

        const labels = await Label.find().sort({ name: 1 });
        response.status(200).json(labels);
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

        if (!isDbConnected()) {
            const label = createCachedLabel({
                name,
                color: request.body.color || '#5f6368',
                slug: request.body.slug
            });
            return response.status(201).json(label);
        }

        const slug = slugify(request.body.slug || name);
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
        const ids = Array.isArray(request.body.ids) ? request.body.ids : [];
        const labelInput = String(request.body.label || '').trim();

        if (!ids.length || !labelInput) {
            return response.status(400).json('Email ids and label are required');
        }

        const labelSlug = slugify(labelInput);
        let label = getLabelBySlug(labelSlug);

        if (!label) {
            if (!isDbConnected()) {
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

        for (const emailId of ids) {
            const resolved = await findEmailRecord(emailId);
            if (!resolved) {
                continue;
            }

            const currentLabels = Array.isArray(resolved.email.labels) ? resolved.email.labels : [];
            const nextLabels = currentLabels.includes(label.slug)
                ? currentLabels
                : [...currentLabels, label.slug];

            const updates = {
                labels: nextLabels,
                in_inbox: false
            };

            if (resolved.source === 'cache') {
                if (updateCachedEmail(emailId, updates)) {
                    updatedCount += 1;
                }
                continue;
            }

            await Email.findByIdAndUpdate(emailId, { $set: updates });
            updatedCount += 1;
        }

        if (!isDbConnected()) {
            saveMailboxCacheToDisk();
        }

        return response.status(200).json({
            label: label.slug,
            updated: updatedCount
        });
    } catch (error) {
        return response.status(500).json(error.message);
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
