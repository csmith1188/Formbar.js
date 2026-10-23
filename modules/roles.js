const { SCOPES } = require("@modules/scopes");

const ROLE_NAMES = {
    BANNED: "Banned",
    GUEST: "Guest",
    STUDENT: "Student",
    MOD: "Mod",
    TEACHER: "Teacher",
    MANAGER: "Manager",
};

const DEFAULT_ROLE_COLORS = {
    [ROLE_NAMES.BANNED]: "#808080",
    [ROLE_NAMES.GUEST]: "#95A5A6",
    [ROLE_NAMES.STUDENT]: "#3498DB",
    [ROLE_NAMES.MOD]: "#2ECC71",
    [ROLE_NAMES.TEACHER]: "#F39C12",
    [ROLE_NAMES.MANAGER]: "#E74C3C",
};

const DEFAULT_BANNED_SCOPES = {
    global: [SCOPES.GLOBAL.SYSTEM.BLOCKED],
    class: [SCOPES.CLASS.SYSTEM.BLOCKED],
};

const DEFAULT_GUEST_SCOPES = {
    global: [],
    class: [SCOPES.CLASS.POLL.READ, SCOPES.CLASS.LINKS.READ],
};

const DEFAULT_STUDENT_SCOPES = {
    global: [SCOPES.GLOBAL.POOLS.MANAGE, SCOPES.GLOBAL.DIGIPOGS.TRANSFER, ...DEFAULT_GUEST_SCOPES.global],
    class: [
        SCOPES.CLASS.POLL.READ,
        SCOPES.CLASS.POLL.VOTE,
        SCOPES.CLASS.BREAK.REQUEST,
        SCOPES.CLASS.TIMER.READ,
        SCOPES.CLASS.HELP.REQUEST,
        ...DEFAULT_GUEST_SCOPES.class,
    ],
};

const DEFAULT_MOD_SCOPES = {
    global: [SCOPES.GLOBAL.SYSTEM.MODERATE, ...DEFAULT_STUDENT_SCOPES.global],
    class: [
        SCOPES.CLASS.POLL.CREATE,
        SCOPES.CLASS.POLL.END,
        SCOPES.CLASS.POLL.DELETE,
        SCOPES.CLASS.POLL.SHARE,

        SCOPES.CLASS.BREAK.APPROVE,
        SCOPES.CLASS.HELP.APPROVE,

        SCOPES.CLASS.AUXILIARY.CONTROL,
        SCOPES.CLASS.LINKS.MANAGE,

        ...DEFAULT_STUDENT_SCOPES.class,
    ],
};

const DEFAULT_TEACHER_SCOPES = {
    global: [SCOPES.GLOBAL.CLASS.CREATE, SCOPES.GLOBAL.CLASS.DELETE, SCOPES.GLOBAL.DIGIPOGS.REVOKE, ...DEFAULT_MOD_SCOPES.global],
    class: [
        SCOPES.CLASS.STUDENTS.READ,
        SCOPES.CLASS.STUDENTS.KICK,
        SCOPES.CLASS.STUDENTS.BAN,

        SCOPES.CLASS.SESSION.START,
        SCOPES.CLASS.SESSION.END,
        SCOPES.CLASS.SESSION.RENAME,
        SCOPES.CLASS.SESSION.SETTINGS,
        SCOPES.CLASS.SESSION.REGENERATE_CODE,

        SCOPES.CLASS.TIMER.CONTROL,

        SCOPES.CLASS.DIGIPOGS.AWARD,

        ...DEFAULT_MOD_SCOPES.class,
    ],
};

const DEFAULT_MANAGER_SCOPES = {
    global: [SCOPES.GLOBAL.SYSTEM.ADMIN, SCOPES.GLOBAL.USERS.MANAGE, SCOPES.GLOBAL.DIGIPOGS.AWARD, ...DEFAULT_TEACHER_SCOPES.global],
    class: [SCOPES.CLASS.SYSTEM.ADMIN, ...DEFAULT_TEACHER_SCOPES.class],
};

// Maps role names to their default scope sets
const ROLES = {
    [ROLE_NAMES.BANNED]: DEFAULT_BANNED_SCOPES,
    [ROLE_NAMES.GUEST]: DEFAULT_GUEST_SCOPES,
    [ROLE_NAMES.STUDENT]: DEFAULT_STUDENT_SCOPES,
    [ROLE_NAMES.MOD]: DEFAULT_MOD_SCOPES,
    [ROLE_NAMES.TEACHER]: DEFAULT_TEACHER_SCOPES,
    [ROLE_NAMES.MANAGER]: DEFAULT_MANAGER_SCOPES,
};

// Maps legacy numeric permission levels to role names
const LEVEL_TO_ROLE = {
    0: ROLE_NAMES.BANNED,
    1: ROLE_NAMES.GUEST,
    2: ROLE_NAMES.STUDENT,
    3: ROLE_NAMES.MOD,
    4: ROLE_NAMES.TEACHER,
    5: ROLE_NAMES.MANAGER,
};

// Maps role names back to numeric levels (for hierarchy comparisons)
const ROLE_TO_LEVEL = {
    [ROLE_NAMES.BANNED]: 0,
    [ROLE_NAMES.GUEST]: 1,
    [ROLE_NAMES.STUDENT]: 2,
    [ROLE_NAMES.MOD]: 3,
    [ROLE_NAMES.TEACHER]: 4,
    [ROLE_NAMES.MANAGER]: 5,
};

/**
 * Checks if a role is at or above a minimum role in the hierarchy.
 * @param {string} roleName - The role to check
 * @param {string} minRoleName - The minimum required role
 * @returns {boolean}
 */
function isRoleAtLeast(roleName, minRoleName) {
    return (ROLE_TO_LEVEL[roleName] ?? 0) >= (ROLE_TO_LEVEL[minRoleName] ?? 0);
}

module.exports = {
    ROLE_NAMES,
    DEFAULT_ROLE_COLORS,
    ROLES,
    LEVEL_TO_ROLE,
    ROLE_TO_LEVEL,
    isRoleAtLeast,
};
