import Contact from '../model/contact.js';
import { isDbConnected } from '../database/db.js';
import {
    getCachedContacts,
    getCachedContactById,
    createCachedContact,
    updateCachedContact,
    deleteCachedContact
} from '../services/contact-store.js';

const serializeContact = (contact) => {
    if (!contact) {
        return null;
    }

    const plain = contact.toObject ? contact.toObject() : contact;
    return {
        ...plain,
        _id: String(plain._id)
    };
};

export const getContacts = async (_, response) => {
    try {
        if (!isDbConnected()) {
            return response.status(200).json(getCachedContacts().map(serializeContact));
        }

        const contacts = await Contact.find().sort({ name: 1 });
        response.status(200).json(contacts.map(serializeContact));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const getContactById = async (request, response) => {
    try {
        if (!isDbConnected()) {
            const contact = getCachedContactById(request.params.id);
            if (!contact) {
                return response.status(404).json('Contact not found');
            }
            return response.status(200).json(serializeContact(contact));
        }

        const contact = await Contact.findById(request.params.id);
        if (!contact) {
            return response.status(404).json('Contact not found');
        }

        response.status(200).json(serializeContact(contact));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const createContact = async (request, response) => {
    try {
        const name = String(request.body.name || '').trim();
        const email = String(request.body.email || '').trim().toLowerCase();

        if (!name || !email) {
            return response.status(400).json('Name and email are required');
        }

        if (!isDbConnected()) {
            const contact = createCachedContact(request.body);
            return response.status(201).json(serializeContact(contact));
        }

        const contact = await Contact.create({
            name,
            email,
            phone: request.body.phone || '',
            company: request.body.company || '',
            notes: request.body.notes || ''
        });

        response.status(201).json(serializeContact(contact));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const updateContact = async (request, response) => {
    try {
        if (!isDbConnected()) {
            const contact = updateCachedContact(request.params.id, request.body);
            if (!contact) {
                return response.status(404).json('Contact not found');
            }
            return response.status(200).json(serializeContact(contact));
        }

        const contact = await Contact.findByIdAndUpdate(
            request.params.id,
            {
                $set: {
                    name: request.body.name,
                    email: request.body.email,
                    phone: request.body.phone,
                    company: request.body.company,
                    notes: request.body.notes
                }
            },
            { new: true }
        );

        if (!contact) {
            return response.status(404).json('Contact not found');
        }

        response.status(200).json(serializeContact(contact));
    } catch (error) {
        response.status(500).json(error.message);
    }
};

export const deleteContact = async (request, response) => {
    try {
        if (!isDbConnected()) {
            const removed = deleteCachedContact(request.params.id);
            if (!removed) {
                return response.status(404).json('Contact not found');
            }
            return response.status(200).json('Contact deleted');
        }

        const contact = await Contact.findByIdAndDelete(request.params.id);
        if (!contact) {
            return response.status(404).json('Contact not found');
        }

        response.status(200).json('Contact deleted');
    } catch (error) {
        response.status(500).json(error.message);
    }
};
