import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG_PATH = path.resolve(process.cwd(), 'auth.config.json');

const readJsonConfig = () => {
    if (!fs.existsSync(CONFIG_PATH)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed?.username || !parsed?.password) {
            return null;
        }
        return {
            username: String(parsed.username),
            password: String(parsed.password)
        };
    } catch (error) {
        console.error('Failed to read auth.config.json:', error.message);
        return null;
    }
};

export const getAuthCredentials = () => {
    const envUsername = process.env.AUTH_USERNAME;
    const envPassword = process.env.AUTH_PASSWORD;

    if (envUsername && envPassword) {
        return {
            username: envUsername,
            password: envPassword,
            source: 'env'
        };
    }

    const jsonConfig = readJsonConfig();
    if (jsonConfig) {
        return {
            ...jsonConfig,
            source: 'file'
        };
    }

    return null;
};

export const isAuthConfigured = () => Boolean(getAuthCredentials());
