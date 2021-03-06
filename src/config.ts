import { envs } from './envs';
import { AppError } from './errors';

export const config = {
    get CONNECTION_STRING() {
        // Return whole string at once
        if (envs.DATABASE.CONNECTION_STRING !== '') {
            return envs.DATABASE.CONNECTION_STRING;
        }

        // Check if any db envs are missing
        const missingEnvs = Object.keys(Object.fromEntries(Object.entries({
            DATABASE_HOSTNAME: envs.DATABASE.HOSTNAME,
            DATABASE_USERNAME: envs.DATABASE.USERNAME,
            DATABASE_PASSWORD: envs.DATABASE.PASSWORD,
            DATABASE_PORT: envs.DATABASE.PORT,
            DATABASE_NAME: envs.DATABASE.DATABASE_NAME,
        }).filter(([, env]) => env === '')));

        // Missing at least one env
        if (missingEnvs.length >= 1) {
            throw new AppError(`${missingEnvs[0]} isn't set!`);
        }

        const authentication = `${envs.DATABASE.USERNAME}:${envs.DATABASE.PASSWORD}@`;
        return `postgres://${authentication}${envs.DATABASE.HOSTNAME}:${envs.DATABASE.PORT}/${envs.DATABASE.DATABASE_NAME}`;
    },
    get ADMIN_API_KEY() {
        return envs.ADMIN.API_KEY;
    },
    get API_KEY_WAS_GENERATED() {
        return process.env.ADMIN_API_KEY === undefined || process.env.ADMIN_API_KEY.trim() === '';
    },
    get PUBLIC_URL() {
        return process.env.PUBLIC_URL || `http://localhost:${envs.WEB.PORT}\/`;
    }
};

export type Config = typeof config;
