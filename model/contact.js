import mongoose from 'mongoose';

const ContactSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        default: ''
    },
    company: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    }
});

const contact = mongoose.model('contacts', ContactSchema);

export default contact;
