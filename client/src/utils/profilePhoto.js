import { parseSenderEmail } from './emailFormatter.js';

export const getProfilePhoto = (address = '') => (
    parseSenderEmail(address).trim().toLowerCase() === 'paul@tensology.com'
        ? '/paul-profile.png'
        : ''
);
