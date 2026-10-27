import { parseSenderEmail } from './emailFormatter.js';

const PROFILE_PHOTOS = {
    'paul@tensology.com': '/paul-profile.png',
    'paul@planmycharter.com': '/paul-profile.png',
    'pippa@planmycharter.com': '/pippa-profile.png'
};

export const getProfilePhoto = (address = '') => {
    const email = parseSenderEmail(address).trim().toLowerCase();
    return PROFILE_PHOTOS[email] || '';
};
