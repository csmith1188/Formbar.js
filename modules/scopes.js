const SCOPES = {
    GLOBAL: {
        CLASS: {
            CREATE: "global.class.create",
            DELETE: "global.class.delete",
        },
        USERS: {
            MANAGE: "global.users.manage",
        },
        DIGIPOGS: {
            AWARD: "global.digipogs.award",
            TRANSFER: "global.digipogs.transfer",
            REVOKE: "global.digipogs.revoke"
        },
        POOLS: {
            MANAGE: "global.pools.manage",
        },
        SYSTEM: {
            ADMIN: "global.system.admin",
            MODERATE: "global.system.moderate",
            BLOCKED: "global.system.blocked",
        },
    },

    CLASS: {
        SYSTEM: {
            ADMIN: "class.system.admin",
            PANEL_ACCESS: "class.system.panel_access",
            CAN_DELETE_CLASS: "class.system.can_delete_class",
            CAN_RENAME_CLASS: "class.system.can_rename_class",
            BLOCKED: "class.system.blocked",
        },

        POLL: {
            READ: "class.poll.read",
            VOTE: "class.poll.vote",
            CREATE: "class.poll.create",
            END: "class.poll.end",
            DELETE: "class.poll.delete",
            SHARE: "class.poll.share",
            READ_CORRECT_ANSWERS: "class.poll.read_correct_answers",
        },

        ROLES: {
            ASSIGN: "class.roles.assign",
            READ: "class.roles.read",
            MANAGE: "class.roles.manage",
        },

        STUDENTS: {
            READ: "class.students.read",
            KICK: "class.students.kick",
            BAN: "class.students.ban",
        },

        SESSION: {
            START: "class.session.start",
            END: "class.session.end",
            RENAME: "class.session.rename",
            SETTINGS: "class.session.settings",
            REGENERATE_CODE: "class.session.regenerate_code",
        },

        BREAK: {
            REQUEST: "class.break.request",
            APPROVE: "class.break.approve",
            END: "class.break.end",
        },

        HELP: {
            REQUEST: "class.help.request",
            APPROVE: "class.help.approve",
        },

        TIMER: {
            READ: "class.timer.read",
            CONTROL: "class.timer.control",
        },

        AUXILIARY: {
            CONTROL: "class.auxiliary.control",
        },

        DIGIPOGS: {
            AWARD: "class.digipogs.award",
        },

        LINKS: {
            READ: "class.links.read",
            MANAGE: "class.links.manage",
        },
    },

    APP: {
        PROFILE: {
            READ: "app.profile.read",
        },

        EMAIL: {
            READ: "app.email.read",
        },

        DIGIPOGS: {
            READ: "app.digipogs.read",
            TRANSFER: "app.digipogs.transfer",
        },

        INVENTORY: {
            GIVE_ITEM: "app.inventory.give_item",
        },

        CLASSES: {
            READ: "app.classes.read",
            SESSION_READ: "app.classes.session.read",
        },

        POLLS: {
            READ: "app.polls.read",
            VOTE: "app.polls.vote",
        },

        NOTIFICATIONS: {
            SEND: "app.notifications.send",
            READ: "app.notifications.read",
        },
    },
};

module.exports = {
    SCOPES,
};
