import { Command } from '@/command';
import { AppError, InvalidCommandError } from '@/errors';
import { Server } from '@/servers';
import type { Message } from 'discord.js';

export class SetBotCommandsChannel extends Command {
    public name = 'Set bot commands channel';
    public command = 'set-bot-commands-channel';
    public timeout = Command.TIMEOUTS.FIVE_SECONDS;
    public description = 'Set the room where the bot should post startup/shutdown messages.';
    public hidden = false;
    public owner = false;
    public examples = [];
    public roles = ['test-role'];

    async handler(prefix: string, message: Message, args: string[]) {
        // We need at least 1 argument
        if (args.length === 0) {
            throw new InvalidCommandError(prefix, 'set-bot-commands-channel', args);
        }

        // We need no more than 32 characters
        const commandsChannel = args[0];
        if (commandsChannel.length === 1 || commandsChannel.length >= 33) {
            throw new AppError('Invalid channel ID!');
        }

        const server = await Server.findOrCreate({ id: message.guild!.id });
        server.channels.botCommands = commandsChannel;
        return `set commands channel to ${commandsChannel}`;
    }
};
