import { sql } from '@databases/pg';
import { Guild, MessageEmbed } from 'discord.js';
import { database } from './database';
import { AppError } from './errors';
import { User } from './user';
import { v4 as uuid } from 'uuid';

interface Command {
    roles: string[];
}

type Alias = string;

interface ServerOptions {
    id: string;
    prefix: string;
    commands: {
        [key: string]: Command
    }
    channels: {
        botCommands: string;
    }
    users: {
        [key: string]: User
    }
    aliases: {
        [command: string]: Alias
    }
}

export class Server {
    public id: string;
    public prefix: string;
    public commands: {
        [key: string]: Command
    }
    public channels: {
        botCommands?: string;
        verification?: string | string[];
    }
    public aliases: {
        [command: string]: Alias
    }

    private attemptParse<T extends any>(option: T): T | undefined {
        try {
            return (typeof option === 'string' ? JSON.parse(option) : option);
        } catch { }
    }

    constructor(options: Partial<ServerOptions> & { id: ServerOptions['id'] }) {
        this.id = options.id;
        this.prefix = options.prefix ?? '!';
        this.commands = this.attemptParse(options.commands) ?? {};
        this.channels = this.attemptParse(options.channels) ?? {
            verification: []
        };
        this.aliases = this.attemptParse(options.aliases) ?? {};
    }

    public async setPrefix(prefix: string) {
        // Prefix must be under 50 chars
        if (prefix.length >= 50) {
            throw new AppError('Prefix is too long, it must be under 50 characters.');
        }

        this.prefix = prefix;
        await database.query(sql`UPDATE servers SET prefix=${prefix} WHERE id=${this.id}`);
    }

    public async getUser({ id }: { id: User['id'] }) {
        return User.findOrCreate({ id, serverId: this.id });
    }

    public async createUser({ id }: { id: User['id'] }) {
        return User.create({ id, serverId: this.id });
    }

    public static async botRemoved(guild: Guild) {
        await database.query(sql`UPDATE servers SET enabled=${false} WHERE id=${guild.id}`);
    }

    /**
     * The bot was just added to a server.
     * 
     * Note: By default servers get a free trial for 3 months.
     *       After the trail period we send a DM to the owner asking
     *       them to upgrade and we reset this counter.
     */
    public async botAdded(membershipType: 'free' | 'premium' | 'platinum' = 'free', membershipMethod: 'trial' | 'purchase' | 'award' | 'gift' = 'trial') {
        const NOW = new Date().getTime();
        const SECOND = 1000;
        const MINUTE = SECOND * 60;
        const HOUR = MINUTE * 60;
        const DAY = HOUR * 24;
        const THREE_MONTHS = DAY * 100;
        const addMembership = sql`
            INSERT INTO memberships
                (id,serverId,type,method,startTimestamp,endTimestamp)
            VALUES
                (${uuid()},${this.id},${membershipType},${membershipMethod},${new Date(NOW)},${new Date(NOW + THREE_MONTHS)})
            ON CONFLICT (serverId)
            DO UPDATE SET startTimestamp = EXCLUDED.startTimestamp, endTimestamp = EXCLUDED.endTimestamp;
        `;
        const addServer = sql`
            INSERT INTO servers
                (id,enabled)
            VALUES
                (${this.id},${true})
            ON CONFLICT (id)
            DO UPDATE SET enabled = EXCLUDED.enabled;
        `;
        // Add membership to DB
        await database.query(addMembership);
        // Add server to DB
        await database.query(addServer);
    }

    public static async find({ id }: { id: Server['id'] }) {
        const servers = await database.query<ServerOptions>(sql`SELECT * FROM servers WHERE id=${id};`);

        // Return existing server
        if (servers.length === 1) {
            return new Server(servers[0]);
        }
    }

    public static async findOrCreate({ id }: { id: Server['id'] }) {
        const server = await this.find({ id });

        // No server found
        if (!server) {
            return this.create({ id });
        }

        // Return existing server
        return server;
    }

    public static async create({ id }: { id: Server['id'] }) {
        // Create server
        const prefix = '!';
        const channels = JSON.stringify({});
        const aliases = JSON.stringify({});
        const setup = false;
        // If the bot is readded to the server allow them to rerun setup
        await database.query(sql`INSERT INTO servers(id,prefix,channels,aliases,setup) VALUES (${id},${prefix},${channels},${aliases},${setup}) ON CONFLICT (id) DO UPDATE SET setup = EXCLUDED.setup;`);

        // Failed to create server
        const servers = await database.query<ServerOptions>(sql`SELECT * FROM servers WHERE id=${id};`);
        if (servers.length === 0) {
            throw new AppError(`Failed to create server ${id}`);
        }

        // Return new server
        return new Server(servers[0]);
    }
};
