import mongoose from 'mongoose';

const SettingSchema = mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

const setting = mongoose.model('settings', SettingSchema);

export default setting;
