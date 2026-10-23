import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const buildSslConfig = (env = process.env) => {
    if (String(env.PGSSL || '').toLowerCase() !== 'true') {
        return undefined;
    }

    return { rejectUnauthorized: false };
};

export const getPostgresConfig = (env = process.env) => {
    if (env.DATABASE_URL) {
        return {
            connectionString: env.DATABASE_URL,
            ssl: buildSslConfig(env)
        };
    }

    if (!env.PGHOST && !env.PGDATABASE) {
        return null;
    }

    return {
        host: env.PGHOST || '127.0.0.1',
        port: Number(env.PGPORT || 5432),
        database: env.PGDATABASE || 'mailshot',
        user: env.PGUSER || '',
        password: env.PGPASSWORD || '',
        ssl: buildSslConfig(env)
    };
};

export const isPostgresConfigured = (env = process.env) => Boolean(getPostgresConfig(env));

export const createPostgresPool = ({ env = process.env, PoolImpl = Pool } = {}) => {
    const config = getPostgresConfig(env);
    if (!config) {
        throw new Error('Postgres is not configured. Set DATABASE_URL or PGHOST/PGDATABASE.');
    }

    return new PoolImpl(config);
};
