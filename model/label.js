import mongoose from 'mongoose';

const LabelSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    color: {
        type: String,
        default: '#5f6368'
    },
    user_id: {
        type: String,
        default: 'default'
    }
});

const label = mongoose.model('labels', LabelSchema);

export default label;
