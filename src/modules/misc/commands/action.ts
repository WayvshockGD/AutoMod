import pluralize from 'pluralize';
import { Command } from '@/command';
import { AppError } from '@/errors';
import type { Message } from 'discord.js';

interface Permissions {
    allowed: string[];
    denied: string[];
}

interface Action {
    stats: {
        total: number;
    }
}

class Member {
    public permissions = {
        actions: {
            hug: {
                allowed: [],
                denied: []
            } as Permissions
        }
    };

    public actions = {
        hug: {
            stats: {
                total: 0
            }
        } as Action
    }

    constructor(public id: string) {}

    public canPerformAction(otherMember: string, action: keyof Member['permissions']['actions']) {
        const permissions = this.getPermissions(action);
        return permissions.allowed.includes(otherMember);
    }

    public allowMemberToPerformAction(otherMember: Member, action: keyof Member['permissions']['actions']) {
        const permissions = this.getPermissions(action);
        if (permissions.allowed.includes(otherMember.id)) {
            throw new AppError(`<@!%s> is already allowed!`, otherMember.id);
        }

        this.permissions.actions[action].allowed.push(otherMember.id);
    }

    public getStats(action: keyof Member['actions']) {
        // Add inital object if missing
        if (!this.actions[action]) {
            this.actions[action] = {
                stats: {
                    total: 0
                }
            };
        }

        return this.actions[action].stats;
    }

    public getPermissions(action: keyof Member['permissions']['actions']) {
        // Add inital object if missing
        if (!this.permissions.actions[action]) {
            this.permissions.actions[action] = {
                allowed: [],
                denied: []
            };
        }

        return this.permissions.actions[action];
    }

    public isFirstTime(action: string) {
        return Object.keys(this.actions).includes(action) === false;
    }
}

export class PerformAction extends Command {
    public name = 'Action';
    public command = 'action';
    public timeout = Command.TIMEOUTS.FIVE_SECONDS;
    public description = 'Performs an action towards another member';
    public hidden = true;
    public owner = false;
    public broken = true;
    public examples = [ '!action hug @everyone' ];
    public roles = [ '@everyone' ];
    public allowedActions = [ 'hug' ];

    private cache: {
        members: {
            [id: string]: Member
        }
    };

    private commands: {
        [key: string]: (message: Message, args: string[]) => string;
    };

    constructor() {
        super();

        this.cache = {
            members: {}
        }

        this.commands = {
            // !action hug count @OmgImAlexis
            count: (_message: Message, args: string[]) => {
                const member = this.getMember(args[2]);
                const action = this.getAction(args[0]);
                return `<@!${member.id}> has been given ${member.getStats(action).total} ${pluralize(action)}`;
            },
            // !action hug allow @OmgImAlexis
            allow: (message: Message, args: string[]) => {
                const member = this.getMember(message.author.id);
                const action = this.getAction(args[0]);
                const allowedMember = this.getMember(args[2]);
                member.allowMemberToPerformAction(allowedMember, action);
                return `<@!${allowedMember.id}> can now ${action} <@!${member.id}>`;
            },
            // !action hug list @OmgImAlexis
            list: (message: Message, args: string[]) => {
                const member = this.getMember(message.author.id);
                const action = this.getAction(args[0]);
                const allowedMembers = member.getPermissions(action).allowed;
                if (!allowedMembers || allowedMembers.length === 0) {
                    return `no one is allowed to ${action} you`;
                }
                return `${allowedMembers.map(name => `<@!${name}>`).join(', ')} is allowed to ${action} you`;
            },
        };
    }

    private getAction(action: string) {
        return action as keyof Member['permissions']['actions'];
    }

    private getMember(memberId: string) {
        const member = this.cache.members[memberId];
        return member ?? this.addMember(memberId);
    }

    private addMember(memberId: string) {
        const member = new Member(memberId);
        this.cache.members[memberId] = member;
        return member;
    }

    private isSubCommand(_message: Message, args: string[]) {
        const subCommands = ['count', 'allow', 'list'];
        return subCommands.includes(args[1]);
    }

    // !action hug count @OmgImAlexis#1546
    //         0   1     2
    async handler(_prefix: string, message: Message, args: string[] = []): Promise<string> {
        // Sub command
        if (this.isSubCommand(message, args)) {
            const command = args[1];
            const result = this.commands[command](message, args);
            
            return result;
        }

        // Show current actions
        if (args.length === 0) {
            const member = this.getMember(message.author.id);
            return Object.keys(member.actions).join(', ');
        }

        // Get current member to perform action against
        const memberId = this.isSubCommand(message, args) ? args[2] : args[1];
        const member = this.getMember(memberId);
        const action = this.getAction(this.isSubCommand(message, args) ? args[1] : args[0]);

        // Don't allow anyone to use `@everyone`
        if (memberId.includes('@everyone')) {
            throw new AppError(`You don't have permission to tag @everyone!`);
        }

        // Not a tagged user
        if (!memberId.startsWith('<@') || memberId.startsWith('@')) {
            const allArgs = args.join(' ').toLocaleLowerCase();
            if (allArgs.includes('himself') || allArgs.includes('herself') || allArgs.includes('myself') || allArgs.includes('themselves')) {
                return `@automod hugs you`;
            }
            return `I could be wrong but are you sure "${memberId}" is a human?`;
        }

        // Invalid permission
        if (!member.canPerformAction(memberId, action)) {
            throw new AppError(`You don't have permission to ${pluralize.singular(action)} <@${member.id}>`);
        }

        // First time
        if (member.isFirstTime(action)) {
            return `<@!${message.author.id}> gives <@!${member.id}> their very first ${pluralize.singular(action)}`;
        }

        // Increase action
        const [_, ...leftOverArgs] = args;
        const amountOfTimes = args[1] !== undefined ? (parseInt(leftOverArgs.join(' ').trim().split(' ')[0], 10) || 1) : 1;
        this.cache.members[memberId].count += amountOfTimes;
        return `*hugs* ${args[0]} ${amountOfHugs} time${amountOfHugs === 1 ? '' : 's'}`;
    }
};