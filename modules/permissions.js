const { ROLE_TO_LEVEL, ROLE_NAMES, ROLES } = require("@modules/roles");
const { SCOPES } = require("@modules/scopes");
const { getRoleId, getRoleName } = require("@modules/role-reference");

const BANNED_PERMISSIONS = ROLE_TO_LEVEL[ROLE_NAMES.BANNED];
const GUEST_PERMISSIONS = ROLE_TO_LEVEL[ROLE_NAMES.GUEST];
const STUDENT_PERMISSIONS = ROLE_TO_LEVEL[ROLE_NAMES.STUDENT];
const MOD_PERMISSIONS = ROLE_TO_LEVEL[ROLE_NAMES.MOD];
const TEACHER_PERMISSIONS = ROLE_TO_LEVEL[ROLE_NAMES.TEACHER];
const MANAGER_PERMISSIONS = ROLE_TO_LEVEL[ROLE_NAMES.MANAGER];

const GLOBAL_STUDENT_SCOPES = [SCOPES.GLOBAL.POOLS.MANAGE, SCOPES.GLOBAL.DIGIPOGS.TRANSFER];
const GLOBAL_MOD_SCOPES = [SCOPES.GLOBAL.SYSTEM.MODERATE];
const GLOBAL_TEACHER_SCOPES = [SCOPES.GLOBAL.CLASS.CREATE, SCOPES.GLOBAL.CLASS.DELETE, SCOPES.GLOBAL.DIGIPOGS.REVOKE];
const GLOBAL_MANAGER_SCOPES = [SCOPES.GLOBAL.SYSTEM.ADMIN, SCOPES.GLOBAL.USERS.MANAGE, SCOPES.GLOBAL.DIGIPOGS.AWARD];
const GLOBAL_BLOCKED_SCOPES = [SCOPES.GLOBAL.SYSTEM.BLOCKED];

const CLASS_STUDENT_SCOPES = [SCOPES.CLASS.POLL.VOTE, SCOPES.CLASS.BREAK.REQUEST, SCOPES.CLASS.HELP.REQUEST, SCOPES.CLASS.TIMER.READ];
const CLASS_MOD_SCOPES = [
    SCOPES.CLASS.POLL.CREATE,
    SCOPES.CLASS.POLL.END,
    SCOPES.CLASS.POLL.DELETE,
    SCOPES.CLASS.POLL.SHARE,
    SCOPES.CLASS.BREAK.APPROVE,
    SCOPES.CLASS.HELP.APPROVE,
    SCOPES.CLASS.AUXILIARY.CONTROL,
    SCOPES.CLASS.LINKS.MANAGE,
];
const CLASS_TEACHER_SCOPES = [
    SCOPES.CLASS.SYSTEM.PANEL_ACCESS,
    SCOPES.CLASS.STUDENTS.READ,
    SCOPES.CLASS.STUDENTS.KICK,
    SCOPES.CLASS.STUDENTS.BAN,
    SCOPES.CLASS.SESSION.START,
    SCOPES.CLASS.SESSION.END,
    SCOPES.CLASS.SESSION.RENAME,
    SCOPES.CLASS.SESSION.SETTINGS,
    SCOPES.CLASS.SESSION.REGENERATE_CODE,
    SCOPES.CLASS.ROLES.READ,
    SCOPES.CLASS.ROLES.ASSIGN,
    SCOPES.CLASS.ROLES.MANAGE,
    SCOPES.CLASS.BREAK.APPROVE,
    SCOPES.CLASS.BREAK.END,
    SCOPES.CLASS.HELP.APPROVE,
    SCOPES.CLASS.TIMER.CONTROL,
    SCOPES.CLASS.DIGIPOGS.AWARD,
];
const CLASS_MANAGER_SCOPES = [SCOPES.CLASS.SYSTEM.ADMIN];
const CLASS_BLOCKED_SCOPES = [SCOPES.CLASS.SYSTEM.BLOCKED];

/**
 * Normalize a stored scope field into an array of string scope keys.
 *
 * @param {*} value - value.
 * @returns {*}
 */
function parseScopesField(value) {
    if (Array.isArray(value)) {
        return value.filter((scope) => typeof scope === "string");
    }

    if (typeof value !== "string" || !value.trim()) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((scope) => typeof scope === "string") : [];
    } catch {
        return [];
    }
}

/**
 * Keep only scopes that belong to the requested permission domain.
 *
 * @param {*} value - value.
 * @param {*} domain - domain.
 * @returns {*}
 */
function filterScopesByDomain(value, domain) {
    const prefix = domain === "global" ? "global." : "class.";
    return parseScopesField(value).filter((scope) => typeof scope === "string" && scope.startsWith(prefix));
}

/**
 * Check whether any candidate scope exists in the resolved scope set.
 *
 * @param {*} scopeSet - scopeSet.
 * @param {*} candidateScopes - candidateScopes.
 * @returns {boolean}
 */
function hasAnyScope(scopeSet, candidateScopes) {
    return candidateScopes.some((scope) => scopeSet.has(scope));
}

/**
 * Normalizes mixed permission inputs into a unique array of scope strings.
 * Entries may already be scope keys, or may be role-like values that need to be
 * expanded via {@link getScopesFromRoleLike} for the requested domain.
 *
 * @param {Array<string|number|object>} input
 * @param {{domain?: "global"|"class", availableRoles?: Array<{id: number|string, scopes?: string[]|string}>}} [options={}]
 * @returns {string[]}
 */
function normalizeScopes(input, options = {}) {
    if (!Array.isArray(input) || input.length === 0) {
        return [];
    }

    const domain = options.domain === "global" ? "global" : "class";
    const prefix = `${domain}.`;
    const scopes = new Set();

    for (const entry of input) {
        if (typeof entry === "string" && entry.includes(".")) {
            if (entry.startsWith(prefix)) {
                scopes.add(entry);
            }
            continue;
        }

        const entryScopes = getScopesFromRoleLike(entry, domain, options);
        for (const scope of entryScopes) {
            scopes.add(scope);
        }
    }

    return [...scopes];
}

/**
 * Expand a role-like value into the scopes that apply for one domain.
 *
 * @param {*} roleLike - roleLike.
 * @param {*} domain - domain.
 * @param {*} options - options.
 * @returns {*}
 */
function getScopesFromRoleLike(roleLike, domain, options = {}) {
    if (!roleLike) {
        return [];
    }

    if (roleLike && typeof roleLike === "object" && Object.prototype.hasOwnProperty.call(roleLike, "scopes")) {
        return filterScopesByDomain(roleLike.scopes, domain);
    }

    const roleId = getRoleId(roleLike);
    if (roleId != null && Array.isArray(options.availableRoles)) {
        const availableRole = options.availableRoles.find((role) => Number(role.id) === Number(roleId));
        if (availableRole) {
            return filterScopesByDomain(availableRole.scopes, domain);
        }
    }

    const roleName = getRoleName(roleLike);
    if (roleName && ROLES[roleName]) {
        return [...(ROLES[roleName][domain] || [])];
    }

    return [];
}

/**
 * Detect whether the global scopes include admin access.
 *
 * @param {*} globalScopes - globalScopes.
 * @returns {boolean}
 */
function hasGlobalAdminScope(globalScopes) {
    const scopeSet = new Set(normalizeScopes(globalScopes, { domain: "global" }));
    return hasAnyScope(scopeSet, GLOBAL_MANAGER_SCOPES);
}

/**
 * Collapse global scopes into the highest matching permission level.
 *
 * @param {*} globalScopes - globalScopes.
 * @returns {*}
 */
function computeGlobalPermissionLevel(globalScopes) {
    const scopeSet = new Set(normalizeScopes(globalScopes, { domain: "global" }));

    if (hasAnyScope(scopeSet, GLOBAL_BLOCKED_SCOPES)) {
        return BANNED_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, GLOBAL_MANAGER_SCOPES)) {
        return MANAGER_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, GLOBAL_TEACHER_SCOPES)) {
        return TEACHER_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, GLOBAL_MOD_SCOPES)) {
        return MOD_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, GLOBAL_STUDENT_SCOPES)) {
        return STUDENT_PERMISSIONS;
    }

    return GUEST_PERMISSIONS;
}

/**
 * Collapse class scopes into the highest matching class permission level.
 *
 * @param {*} classScopes - classScopes.
 * @param {*} options - options.
 * @returns {*}
 */
function computeClassPermissionLevel(classScopes, options = {}) {
    const scopeSet = new Set(normalizeScopes(classScopes, { domain: "class" }));
    const hasOwnerBypass = Boolean(options.isOwner);

    if (hasAnyScope(scopeSet, CLASS_BLOCKED_SCOPES) && !hasOwnerBypass && !hasAnyScope(scopeSet, CLASS_MANAGER_SCOPES)) {
        return BANNED_PERMISSIONS;
    }

    if (hasOwnerBypass || hasAnyScope(scopeSet, CLASS_MANAGER_SCOPES)) {
        return MANAGER_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, CLASS_TEACHER_SCOPES)) {
        return TEACHER_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, CLASS_MOD_SCOPES)) {
        return MOD_PERMISSIONS;
    }

    if (hasAnyScope(scopeSet, CLASS_STUDENT_SCOPES)) {
        return STUDENT_PERMISSIONS;
    }

    return GUEST_PERMISSIONS;
}

/**
 * Check whether the resolved global permission meets a minimum level.
 *
 * @param {*} globalScopes - globalScopes.
 * @param {*} minimumLevel - minimumLevel.
 * @returns {boolean}
 */
function hasGlobalPermissionLevel(globalScopes, minimumLevel) {
    return computeGlobalPermissionLevel(globalScopes) >= minimumLevel;
}

/**
 * Check whether the resolved class permission meets a minimum level.
 *
 * @param {*} classScopes - classScopes.
 * @param {*} minimumLevel - minimumLevel.
 * @param {*} options - options.
 * @returns {boolean}
 */
function hasClassPermissionLevel(classScopes, minimumLevel, options = {}) {
    return computeClassPermissionLevel(classScopes, options) >= minimumLevel;
}

/**
 * Resolve the permission level for the requested domain from mixed input.
 *
 * @param {*} input - input.
 * @param {*} options - options.
 * @returns {*}
 */
function computePermissionLevel(input, options = {}) {
    const domain = options.domain === "global" ? "global" : "class";
    const scopes = normalizeScopes(input, options);
    return domain === "global" ? computeGlobalPermissionLevel(scopes) : computeClassPermissionLevel(scopes, options);
}

module.exports = {
    SCOPES,
    normalizeScopes,
    parseScopesField,
    filterScopesByDomain,
    getScopesFromRoleLike,
    hasGlobalAdminScope,
    computePermissionLevel,
    computeGlobalPermissionLevel,
    computeClassPermissionLevel,
    hasGlobalPermissionLevel,
    hasClassPermissionLevel,
    hasAnyScope,
    GLOBAL_STUDENT_SCOPES,
    GLOBAL_MOD_SCOPES,
    GLOBAL_TEACHER_SCOPES,
    GLOBAL_MANAGER_SCOPES,
    GLOBAL_BLOCKED_SCOPES,
    CLASS_STUDENT_SCOPES,
    CLASS_MOD_SCOPES,
    CLASS_TEACHER_SCOPES,
    CLASS_MANAGER_SCOPES,
    CLASS_BLOCKED_SCOPES,
    BANNED_PERMISSIONS,
    GUEST_PERMISSIONS,
    STUDENT_PERMISSIONS,
    MOD_PERMISSIONS,
    TEACHER_PERMISSIONS,
    MANAGER_PERMISSIONS,
};
