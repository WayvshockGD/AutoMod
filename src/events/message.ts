import ml from 'ml-sentiment';
import type { Message } from 'discord.js';
import { getServer } from '../servers';
import _commands from '../commands';
import { config } from '../config';
import botCommand from '../commands/bot';
import { log } from '../log';
import { promiseTimeout } from '../utils';
import { AppError, InvalidCommandError, CommandPermissionError, MultiLinePermissionError } from '../errors';
import announce from '../commands/announce';
import type { Server } from '../servers';

const getCommand = (commandName: string) => _commands.find(_command => _command.name === commandName);
const isCommandAlias = (server: Server, commandName: string) => Object.keys(server.aliases).includes(commandName);
const capValue = (number: number, min: number, max: number) => Math.max(min, Math.min(number, max));

const processUserExperience = async (message: Message) => {
  const server = getServer(message.guild!.id);
  const user = server.getUser(message.author.id);

  // Analyse sentiment value of message
  const sentiment = ml().classify(message.content);

  // Add experience based on message sentiment
  const oldLevel = user.level;
  const baseXp = 20;
  const sentimentPercentage = sentiment / 100;
  const experience = capValue(1 + (baseXp * sentimentPercentage), -20, 20);
  user.addExperience(experience);
  log.debug('%s gained %s exp for "%s"', message.author.tag, experience, message.content);
  
  // Announce level ups/downs
  const newLevel = user.level;

  // Mute user as they fell under level 0
  if (oldLevel !== 0 && newLevel === 0) {
    await announce.handler(server.prefix, message, `<#776990572052742175> <@!${message.author.id}> you've been muted, please re-read the rules!`.split(' '));
    return;
  }

  // User has gone up a level
  if (oldLevel < newLevel) {
    await announce.handler(server.prefix, message, `<#776990572052742175> <@!${message.author.id}> is now level ${newLevel}`.split(' '));
  }

  // User has gone down a level
  if (oldLevel > newLevel) {
    await announce.handler(server.prefix, message, `<#776990572052742175> <@!${message.author.id}> watch your language you've just gone down to level ${newLevel}`.split(' '));
  }
};

// In milliseconds
const FIVE_SECONDS = 5000;

export const message = async (message: Message) => {
  let silent = false;

  // Get our server
  const server = getServer(message.guild!.id);

  // Skip bot messages
  if (message.author.bot) return;

  // Skip non allowed channels
  if (message.channel.id === '776990572052742175') {
    return;
  }

  // Process user experience
  await processUserExperience(message).catch(error => {
    console.log(error);
  });

  // Skip messages without our prefix
  if (!message.content.startsWith(server.prefix)) return;

  // Silent the output
  if (message.content.startsWith(server.prefix + '$')) {
    // Enable silent mode
    silent = true;
  }

  // Log full message
  log.debug(`[${message.author.tag}]: ${message.content}`);

  const _commandBody = message.content.slice(silent ? server.prefix.length + 1 : server.prefix.length);
  const commandBody = _commandBody.split('\n')[0];
  const args = commandBody.split(' ');
  const commandName = args.shift()?.toLowerCase()?.trim();
  const mutlilineCommand = _commandBody.split('\n').length >= 2;

  try {
    // Bail if there's no command given
    if (!commandName) {
      return;
    }

    // Bail if the command isn't valid
    const command = getCommand(isCommandAlias(server, commandName) ? server.aliases[commandName] : commandName);
    if (!command) {
      throw new InvalidCommandError(server.prefix, commandName, args);
    }

    // Don't allow multi-line commands
    if (mutlilineCommand) {
      throw new MultiLinePermissionError();
    }

    // Internal bot commands
    // These should only work for the person that created the bot
    if (commandName === botCommand.command) {
      // Non-owner user tried accessing bot commands, throw error
      if (config.OWNER.ID !== message.member?.id) {
        log.warn('%s tried accessing the bot commands via server %s', message.member?.id, message.guild?.id);
        throw new CommandPermissionError(commandName);
      }

      // Owner tried bot commands on wrong server, warn them
      if (config.OWNER.SERVER !== message.guild?.id) {
        throw new AppError('wrong server! %sbot can only be used on the server listed in `config.json`', server.prefix);
      }
    }

    // Don't check permissions if this is the owner of the bot
    if (config.OWNER.ID !== message.member?.id) {
      // Check we have permission to run this
      if (!message.member?.roles.cache.some(role => command.roles.includes(role.name))) {
        throw new CommandPermissionError(commandName);
      }
    }

    // Ensure we have the right amount of args
    if (command.arguments.minimum !== undefined || command.arguments.maximum !== undefined) {
      if (args.length < command.arguments.minimum) {
        throw new AppError('Not enough args, %s requires at least %s args.', command.name, command.arguments.minimum);
      }

      if (args.length > command.arguments.maximum) {
        throw new AppError('Too many args, %s requires no more than %s args.', command.name, command.arguments.maximum);
      }
    }

    // Run the command
    const commandPromise = Promise.resolve(command.handler(server.prefix, message, args));
    const result = await promiseTimeout(commandPromise, command.timeout ?? FIVE_SECONDS);

    // No output
    if (!result) {
      throw new AppError('No command output');
    }

    // If result is a string and starts with a capital
    if (typeof result === 'string' && /^[a-z]/.test(result)) {
      log.warn(`Command output started with a lowercase "${result}".`);
    }

    // Skip output
    if (silent) return;

    // Respond with command output
    message.channel.send(result as string);
  } catch (error) {
    // Reply with error
    if (process.env.DEBUG) {
      // Show debugging to owner
      if (config.OWNER.ID === message.member?.id) {
        message.channel.send('```json\n' + JSON.stringify(error, null, 2) + '\n```');
        return;
      }
    }

    log.error(error);
    message.channel.send(error.message);
  }
};