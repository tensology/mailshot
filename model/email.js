import mongoose from 'mongoose';

const AttachmentSchema = mongoose.Schema({
    attachment_id: { type: String, required: true },
    filename: { type: String, required: true },
    content_type: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    storage_path: { type: String, required: true }
}, { _id: false });

const EmailSchema = mongoose.Schema({
    to: {
        type: String,
        default: ''
    },
    cc: {
        type: String,
        default: ''
    },
    bcc: {
        type: String,
        default: ''
    },
    from: {
        type: String,
        default: ''
    },
    subject: String,
    body: String,
    body_html: String,
    date: {
        type: Date,
        default: Date.now
    },
    image: String,
    name: {
        type: String,
        default: ''
    },
    starred: {
        type: Boolean,
        required: true,
        default: false
    },
    bin: {
        type: Boolean,
        required: true,
        default: false
    },
    archived: {
        type: Boolean,
        default: false
    },
    spam: {
        type: Boolean,
        default: false
    },
    in_inbox: {
        type: Boolean,
        default: true
    },
    read: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        required: true,
    },
    messageId: {
        type: String,
        index: true,
        unique: true,
        sparse: true
    },
    in_reply_to: String,
    references: [String],
    labels: {
        type: [String],
        default: []
    },
    attachments: {
        type: [AttachmentSchema],
        default: []
    },
    read_summary: {
        type: String,
        default: ''
    },
    read_summary_status: {
        type: String,
        default: ''
    },
    read_summary_at: {
        type: Date
    },
    read_aloud_status: {
        type: String,
        default: ''
    }
});

EmailSchema.index({ subject: 'text', body: 'text', from: 'text', to: 'text' });

const email = mongoose.model('emails', EmailSchema);

export default email;
