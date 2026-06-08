import mongoose from "mongoose";
import dotenv from 'dotenv';

dotenv.config();

const USERNAME = process.env.DB_USERNAME;
const PASSWORD = process.env.DB_PASSWORD;

const buildConnectionString = () => {
    if (process.env.MONGODB_URI) {
        return process.env.MONGODB_URI;
    }

    if (process.env.DB_URI) {
        return process.env.DB_URI;
    }

    if (USERNAME && PASSWORD) {
        return `mongodb://${USERNAME}:${PASSWORD}@localhost:27017/mailshot?authSource=admin`;
    }

    return '';
};

let isConnected = false;
let lastError = null;

export const isDbConnected = () => isConnected;

export const getDbStatus = () => ({
    connected: isConnected,
    error: lastError?.message || null,
    uriConfigured: !!buildConnectionString()
});

const Connection = () => {
    const DB_URI = buildConnectionString();

    if (!DB_URI) {
        isConnected = false;
        lastError = new Error('MONGODB_URI is not configured. Set MONGODB_URI, DB_URI, or DB_USERNAME/DB_PASSWORD for localhost.');
        console.log(lastError.message);
        return { connected: false };
    }

    mongoose.connect(DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
    }).then(() => {
        mongoose.set('strictQuery', false);
        isConnected = true;
        lastError = null;
        console.log('Database connected sucessfully');
    }).catch((error) => {
        isConnected = false;
        lastError = error;
        console.log('Error while connecting with the database', error.message);
    });

    return { connected: false };
}

export default Connection;
