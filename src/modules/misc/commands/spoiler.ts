import axios from 'axios';
import { Message, MessageAttachment, MessageEmbed } from 'discord.js';
import { client } from '@/client';
import { Command } from '@/command';
import { AppError } from '@/errors';
import { isTextChannelMessage } from '@/guards';

const match = (string: string) => {
  const groups = string.match(/\[(?<warning>.*)\] (?<message>.*)/i)?.groups;
  if (groups) {
    return { ...groups };
  }
};

const getImage = async (url: string) => {
  const imageBuffer = await axios.get(
    url,
    { responseType: 'arraybuffer' },
  );

  return Buffer.from(imageBuffer.data, 'base64');
}

export class Spoiler extends Command {
  public name = 'Spoiler';
  public command = 'spoiler';
  public timeout = Command.TIMEOUTS.FIVE_SECONDS;
  public description = 'Create a spoiler. This works on mobile with images!';
  public hidden = false;
  public owner = false;
  public examples = [
    '!spoiler',
    '!spoiler [CW: This is a test post] Well this is neat!',
    '!spoiler [TW: This is a test post] Well this is neat!',
    '!spoiler Well this is neat!',
  ];
  public roles = [ '@everyone' ];

  public async messageHandler(_prefix: string, message: Message, _args: string[]) {
    return this.handler(_prefix, message, _args);
  }

  public async handler(_prefix: string, message: Message, _args: string[]) {
    if (isTextChannelMessage(message)) {
      // Parse message
      const text = _args.join(' ').trim();
      const spoilerInfo = match(text);

      // Set main content
      const content = (spoilerInfo?.message || text).trim();

      // No chars
      if (content.length === 0 && message.attachments.size === 0) {
        return 'You need to provide a description or image.';
      }

      // Only allow 2000 chars
      if (content.length >= 2000) {
        return `Couldn't spoiler, too many characters. ${content.length}/2000`;
      }

      // Create message
      const member = client.guilds.cache.get(message.guild?.id)?.members.cache.get(message.author.id);
      const embed = new MessageEmbed({
        author: {
          name: member?.displayName ?? message.author.username,
          iconURL: message.author.avatarURL({
            size: 32
          })?.toString()
        },
        description: `||${content}||\n\nPosted by <@!${message.author.id}>`
      });

      // Create images
      const images = await Promise.all(message.attachments.mapValues(async attachment => {
        const image = await getImage(attachment.url);
        // const extension = attachment.name?.split('.')[attachment.name?.split('.').length - 1];
        // const fileName = `spoiler_image.${extension}`;
        // console.log({fileName, extension});
        return new MessageAttachment(image, `SPOILER_${attachment.name}`, {
          id: Math.random(),
          spoiler: true
        });
        // return {
        //   ...attachment,
        //   attachment: attachment.attachment,
        //   name: `SPOILER_${attachment.name}`,
        //   spoiler: true
        // };
      }).array());

      // Remove original message
      await message.delete();

      // No content just images
      if (content.length === 0) {
        return [...images];
      }

      // Generic spoiler
      if (!spoilerInfo) {
        embed.setTitle(`Spoiler`);
        return [embed, ...images];
      }

      // Warning
      embed.setColor('#FF0000');
      embed.setTitle(spoilerInfo.warning);
      return [embed, ...images];
    }

    throw new AppError('Invalid channel type!');
  }
};
