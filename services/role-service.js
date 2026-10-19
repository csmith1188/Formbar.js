const { dbGetAll, dbGet, dbRun } = require("@modules/database");
const { classStateStore } = require("@services/classroom-service");
const { ROLES, ROLE_NAMES, DEFAULT_ROLE_COLORS, ROLE_TO_LEVEL } = require("@modules/roles");
const { computeGlobalPermissionLevel, filterScopesByDomain, parseScopesField, SCOPES } = require("@modules/permissions");
const { getUserScopes, getAllClassScopes, getUserRoleName } = require("@modules/scope-resolver");
const { requireInternalParam } = require("@modules/error-wrapper");
const { buildRoleReference, buildRoleReferences } = require("@modules/role-reference");
const { getEmailFromId } = require("@services/student-service");
const ValidationError = require("@errors/validation-error");
const NotFoundError = require("@errors/not-found-error");
const ForbiddenError = require("@errors/forbidden-error");

const BUILT_IN_ROLE_NAMES = new Set(Object.values(ROLE_NAMES));
const DEFAULT_CLASS_ROLE_ORDER_CASE_SQL = [
    "CASE __ROLE_NAME__",
    `WHEN '${ROLE_NAMES.MANAGER}' THEN 0`,
    `WHEN '${ROLE_NAMES.TEACHER}' THEN 1`,
    `WHEN '${ROLE_NAMES.MOD}' THEN 2`,
    `WHEN '${ROLE_NAMES.STUDENT}' THEN 3`,
    `WHEN '${ROLE_NAMES.GUEST}' THEN 4`,
    "ELSE NULL",
    "END",
].join("\n             ");
const CLASS_ROLE_ORDER_BY_SQL = "cr.orderIndex IS NULL, cr.orderIndex, r.id";

/**
 * Builds the CASE SQL used to assign the default display order for built-in class roles.
 * @param {string} roleNameExpression
 * @returns {string}
 */
function getDefaultClassRoleOrderCaseSql(roleNameExpression) {
    return DEFAULT_CLASS_ROLE_ORDER_CASE_SQL.replace("__ROLE_NAME__", roleNameExpression);
}

/**
 * Ensures a student object has normalized `roles.global` and `roles.class` arrays.
 * @param {Object} student
 * @returns {void}
 */
function ensureStudentRoleBuckets(student) {
    if (!student || typeof student !== "object") return;
    if (!student.roles || typeof student.roles !== "object" || Array.isArray(student.roles)) {
        student.roles = { global: [], class: [] };
    }
    if (!Array.isArray(student.roles.global)) student.roles.global = [];
    if (!Array.isArray(student.roles.class)) student.roles.class = [];
}

/**
 * Sorts role response objects into their configured class order.
 * @param {Array<{id?: number, orderIndex?: number|null}>} roles
 * @returns {void}
 */
function sortAvailableRoles(roles) {
    if (!Array.isArray(roles)) {
        return;
    }

    roles.sort((left, right) => {
        const leftOrder = left?.orderIndex ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right?.orderIndex ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || Number(left?.id || 0) - Number(right?.id || 0);
    });
}

/**
 * Seeds class-scoped default roles for a newly created class.
 * Legacy classrooms are backfilled by migration code rather than lazily at runtime.
 * @param {string|number} classId
 * @returns {Promise<void>}
 */
async function addDefaultClassRoles(classId) {
    requireInternalParam(classId, "classId");

    const existingClassRoles = await dbGet("SELECT 1 FROM class_roles WHERE classId = ? LIMIT 1", [classId]);
    if (!existingClassRoles) {
        await dbRun(
            `INSERT INTO class_roles (roleId, classId, orderIndex)
             SELECT id, ?, ${getDefaultClassRoleOrderCaseSql("name")}
             FROM roles
             WHERE isDefault = 1`,
            [classId]
        );
    }
}

/**
 * Backfills missing `class_roles.orderIndex` values for one class.
 * @param {string|number} classId
 * @returns {Promise<void>}
 */
async function backfillClassRoleOrderIndexes(classId) {
    requireInternalParam(classId, "classId");

    await dbRun(
        `UPDATE class_roles
         SET orderIndex = ${getDefaultClassRoleOrderCaseSql(`(
             SELECT name
             FROM roles
             WHERE roles.id = class_roles.roleId
         )`)}
         WHERE classId = ?
           AND orderIndex IS NULL`,
        [classId]
    );
}

/**
 * Returns the set of scopes allowed on class-scoped roles.
 * @returns {Set<string>}
 */
function getValidClassScopes() {
    return new Set(getAllClassScopes());
}

/**
 * Maps a database role row into the API/service response shape.
 * @param {{id: number, name: string, scopes?: string|string[], color?: string, orderIndex?: number|null}} role
 * @returns {{id: number, name: string, scopes: string[], color: string, orderIndex: number|null}}
 */
function buildRoleResponse(role) {
    return {
        id: role.id,
        name: role.name,
        scopes: filterScopesByDomain(role.scopes, "class"),
        color: role.color || DEFAULT_ROLE_COLORS[role.name] || "#808080",
        orderIndex: role.orderIndex ?? null,
    };
}

/**
 * Finds an available role already loaded on an in-memory classroom object.
 * @param {Object} classroom
 * @param {string} roleName
 * @returns {Object|null}
 */
function getAvailableRoleByName(classroom, roleName) {
    if (!classroom || !Array.isArray(classroom.availableRoles)) {
        return null;
    }

    return classroom.availableRoles.find((role) => role.name === roleName) || null;
}

/**
 * Finds an active in-memory classroom student by user id.
 * @param {Object|null|undefined} classroom
 * @param {string|number} userId
 * @returns {Promise<Object|null>}
 */
async function findActiveClassStudent(classroom, userId) {
    if (!classroom || typeof classroom !== "object" || !classroom.students || typeof classroom.students !== "object") {
        return null;
    }

    const email = await getEmailFromId(userId);
    if (email && classroom.students[email]) {
        return classroom.students[email];
    }

    return Object.values(classroom.students).find((student) => student && String(student.id) === String(userId)) || null;
}

/**
 * Checks whether a student already has a class role assigned in memory.
 * @param {Object|null|undefined} student
 * @param {string|number} roleId
 * @returns {boolean}
 */
function hasInMemoryClassRole(student, roleId) {
    if (!student) {
        return false;
    }

    ensureStudentRoleBuckets(student);
    return student.roles.class.some((assignedRole) => Number(assignedRole.id) === Number(roleId));
}

/**
 * Normalizes scopes into a stable string key for equality checks.
 * @param {string|string[]|null|undefined} scopes
 * @returns {string}
 */
function buildScopesKey(scopes) {
    return [...new Set(parseScopesField(scopes))].sort().join("|");
}

/**
 * Computes the global permission level for a role-like object.
 * @param {{scopes: string|string[]|null|undefined}} role
 * @returns {number}
 */
function getGlobalRolePermissionLevel(role) {
    return computeGlobalPermissionLevel(parseScopesField(role.scopes));
}
/**
 * Resolves a role by ID for a specific class.
 * Accepts class-scoped role IDs and maps legacy global IDs to the closest
 * class-scoped role by scopes rather than by name.
 * @param {string|number} classId
 * @param {string|number} roleId
 * @returns {Promise<{id: number, name: string, scopes: string, color: string|null, orderIndex?: number|null}|null>}
 */
async function getRoleByIdForClass(classId, roleId) {
    requireInternalParam(classId, "classId");
    requireInternalParam(roleId, "roleId");

    await backfillClassRoleOrderIndexes(classId);

    const classRole = await dbGet(
        `SELECT r.id, r.name, r.scopes, r.color, cr.orderIndex
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE r.id = ? AND cr.classId = ?`,
        [roleId, classId]
    );
    if (classRole) {
        return classRole;
    }

    const globalRole = await dbGet(
        `SELECT r.id, r.name, r.scopes, r.color
         FROM roles r
         WHERE r.id = ?
           AND r.isDefault = 1`,
        [roleId]
    );
    if (!globalRole) {
        return null;
    }

    const classRoles = await dbGetAll(
        `SELECT r.id, r.name, r.scopes, r.color, cr.orderIndex
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE cr.classId = ?`,
        [classId]
    );
    const globalScopesKey = buildScopesKey(globalRole.scopes);
    const exactMatch = classRoles.find((candidate) => buildScopesKey(candidate.scopes) === globalScopesKey);
    if (exactMatch) {
        return exactMatch;
    }

    return classRoles.find((candidate) => candidate.name === globalRole.name) || null;
}

/**
 * Returns all roles available for a class from class-scoped role rows.
 * @param {string|number} classId
 * @returns {Promise<Array<{id: number, name: string, scopes: string[], color: string, orderIndex: number|null}>>}
 */
async function getClassRoles(classId) {
    requireInternalParam(classId, "classId");

    await backfillClassRoleOrderIndexes(classId);

    const rows = await dbGetAll(
        `SELECT r.id, r.name, r.scopes, r.color, cr.orderIndex
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE cr.classId = ?
         ORDER BY ${CLASS_ROLE_ORDER_BY_SQL}`,
        [classId]
    );
    return rows.map((row) => buildRoleResponse(row));
}

/**
 * Finds the first role that matches a permission level, globally or within a class.
 * @param {number} permissionLevel
 * @param {string|number|null} [classId=null]
 * @returns {Promise<{id: number, name: string, scopes: string, color: string|null, orderIndex?: number|null}|null>}
 */
async function findRoleByPermissionLevel(permissionLevel, classId = null) {
    if (classId != null) {
        await backfillClassRoleOrderIndexes(classId);
    }

    const rows =
        classId == null
            ? await dbGetAll(
                  `SELECT r.id, r.name, r.scopes, r.color
                   FROM roles r
                   WHERE r.isDefault = 1
                   ORDER BY r.id`
              )
            : await dbGetAll(
                  `SELECT r.id, r.name, r.scopes, r.color, cr.orderIndex
                   FROM roles r
                   JOIN class_roles cr ON cr.roleId = r.id
                   WHERE cr.classId = ?
                   ORDER BY ${CLASS_ROLE_ORDER_BY_SQL}`,
                  [classId]
              );

    if (classId == null) {
        return rows.find((row) => getGlobalRolePermissionLevel(row) === permissionLevel) || null;
    }

    if (permissionLevel === ROLE_TO_LEVEL[ROLE_NAMES.BANNED]) {
        return rows.find((row) => filterScopesByDomain(row.scopes, "class").includes(SCOPES.CLASS.SYSTEM.BLOCKED)) || null;
    }

    const targetRoleName = Object.keys(ROLE_TO_LEVEL).find((name) => ROLE_TO_LEVEL[name] === permissionLevel);
    return rows.find((row) => row.name === targetRoleName) || null;
}

/**
 * Creates a custom role for a class.
 * @param {Object} params
 * @param {string|number} params.classId
 * @param {string} params.name
 * @param {string[]} params.scopes
 * @param {Object} params.actingClassUser
 * @param {Object} params.classroom
 * @param {string} params.color
 * @returns {Promise<{id: number, name: string, scopes: string[], color: string}>}
 */
async function createClassRole({ classId, name, scopes, actingClassUser, classroom, color }) {
    requireInternalParam(classId, "classId");

    await backfillClassRoleOrderIndexes(classId);

    validateRoleName(name);
    validateScopes(scopes);
    validateNoPrivilegeEscalation(scopes, actingClassUser, classroom);

    const existing = await dbGet(
        `SELECT r.id
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE r.name = ? AND cr.classId = ?`,
        [name, classId]
    );
    if (existing) {
        throw new ValidationError(`A role named "${name}" already exists in this class.`);
    }

    const roleColor = color !== undefined ? color : "#808080";
    const scopesJson = JSON.stringify(scopes);
    const id = await dbRun("INSERT INTO roles (name, scopes, color, isDefault) VALUES (?, ?, ?, 0)", [name, scopesJson, roleColor]);
    const lastOrderIndex = await dbGet("SELECT MAX(orderIndex) AS maxOrder FROM class_roles WHERE classId = ?", [classId]);
    const newOrderIndex = (lastOrderIndex?.maxOrder ?? -1) + 1;
    await dbRun("INSERT INTO class_roles (roleId, classId, orderIndex) VALUES (?, ?, ?)", [id, classId, newOrderIndex]);

    const classroomObj = classStateStore.getClassroom(classId);
    if (classroomObj) {
        if (!classroomObj.customRoles) classroomObj.customRoles = {};
        classroomObj.customRoles[id] = [...scopes];
        if (!Array.isArray(classroomObj.availableRoles)) classroomObj.availableRoles = [];
        classroomObj.availableRoles.push(buildRoleResponse({ id, name, scopes, color: roleColor, orderIndex: newOrderIndex }));
        sortAvailableRoles(classroomObj.availableRoles);
    }

    return { id, name, scopes, color: roleColor };
}

/**
 * Moves users of a shared default role to a new class-specific role.
 * This is because the default roles are shared globally to save storage space, but once modified, they should be treated as custom roles.
 * @param {number|string} oldRoleId
 * @param {number|string} newRoleId
 * @param {string|number} classId
 * @returns {Promise<void>}
 */
async function replaceDefaultRoleAssignments(oldRoleId, newRoleId, classId) {
    await dbRun(
        `INSERT OR IGNORE INTO user_roles (userId, roleId, classId)
         SELECT DISTINCT affected.userId, ?, ?
         FROM (
             SELECT ur.userId
             FROM user_roles ur
             WHERE ur.roleId = ?
               AND ur.classId = ?
             UNION
             SELECT ur.userId
             FROM user_roles ur
             WHERE ur.roleId = ?
               AND ur.classId IS NULL
               AND ur.userId IN (SELECT studentId FROM classusers WHERE classId = ?)
         ) AS affected`,
        [newRoleId, classId, oldRoleId, classId, oldRoleId, classId]
    );

    await dbRun(
        `DELETE FROM user_roles
         WHERE roleId = ?
           AND (
                classId = ?
                OR (
                    classId IS NULL
                    AND userId IN (SELECT studentId FROM classusers WHERE classId = ?)
                )
           )`,
        [oldRoleId, classId, classId]
    );
}

/**
 * Updates a role for a class.
 * @param {Object} params
 * @param {number|string} params.roleId
 * @param {string|number} params.classId
 * @param {{name?: string, scopes?: string[], color?: string, orderIndex?: number}} params.updates
 * @param {Object} params.actingClassUser
 * @param {Object} params.classroom
 * @returns {Promise<{id: number, name: string, scopes: string[], color: string}>}
 */
async function updateClassRole({ roleId, classId, updates, actingClassUser, classroom }) {
    requireInternalParam(roleId, "roleId");
    requireInternalParam(classId, "classId");

    await backfillClassRoleOrderIndexes(classId);

    const role = await dbGet(
        `SELECT r.*, cr.orderIndex
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE r.id = ? AND cr.classId = ?`,
        [roleId, classId]
    );
    if (!role) {
        throw new NotFoundError("Role not found in this class.");
    }

    const isDefault = role.isDefault === 1;
    const oldName = role.name;
    const newName = updates.name !== undefined ? updates.name : role.name;
    let newScopes;
    try {
        newScopes = updates.scopes !== undefined ? updates.scopes : JSON.parse(role.scopes);
    } catch {
        newScopes = [];
    }

    if (isDefault) {
        const validClassScopes = getValidClassScopes();
        newScopes = parseScopesField(newScopes).filter((scope) => validClassScopes.has(scope));
    }

    if (updates.name !== undefined) {
        validateRoleName(newName);
        if (newName !== oldName) {
            const conflict = await dbGet(
                `SELECT r.id
                 FROM roles r
                 JOIN class_roles cr ON cr.roleId = r.id
                 WHERE r.name = ? AND cr.classId = ? AND r.id != ?`,
                [newName, classId, roleId]
            );
            if (conflict) {
                throw new ValidationError(`A role named "${newName}" already exists in this class.`);
            }
        }
    }

    const newColor = updates.color !== undefined ? updates.color : role.color || "#808080";
    if (updates.scopes !== undefined) {
        validateScopes(newScopes);
        validateNoPrivilegeEscalation(newScopes, actingClassUser, classroom);
    }

    const newOrderIndex = updates.orderIndex;
    if (newOrderIndex !== undefined && (!Number.isInteger(newOrderIndex) || newOrderIndex < 0)) {
        throw new ValidationError("orderIndex must be a non-negative integer.");
    }

    const scopesJson = JSON.stringify(newScopes);
    let newRoleId = Number(roleId);
    if (isDefault) {
        await dbRun("BEGIN TRANSACTION", []);
        try {
            newRoleId = await dbRun("INSERT INTO roles (name, scopes, color, isDefault) VALUES (?, ?, ?, 0)", [newName, scopesJson, newColor]);
            await dbRun("UPDATE class_roles SET roleId = ? WHERE roleId = ? AND classId = ?", [newRoleId, roleId, classId]);
            await replaceDefaultRoleAssignments(roleId, newRoleId, classId);
            await dbRun("COMMIT", []);
        } catch (error) {
            try {
                await dbRun("ROLLBACK", []);
            } catch {
                // Ignore rollback failures if the transaction is already closed.
            }
            throw error;
        }
    } else {
        await dbRun("UPDATE roles SET name = ?, scopes = ?, color = ? WHERE id = ?", [newName, scopesJson, newColor, roleId]);
    }

    if (newOrderIndex !== undefined) {
        await dbRun("UPDATE class_roles SET orderIndex = ? WHERE roleId = ? AND classId = ?", [newOrderIndex, newRoleId, classId]);
    }

    const effectiveOrderIndex = newOrderIndex !== undefined ? newOrderIndex : (role.orderIndex ?? null);
    const classroomObj = classStateStore.getClassroom(classId);
    if (classroomObj) {
        if (classroomObj.customRoles) {
            if (newRoleId !== Number(roleId)) {
                delete classroomObj.customRoles[roleId];
            }
            classroomObj.customRoles[newRoleId] = [...newScopes];
        }

        if (Array.isArray(classroomObj.availableRoles)) {
            const availableRole = classroomObj.availableRoles.find((available) => Number(available.id) === Number(roleId));
            if (availableRole) {
                availableRole.id = newRoleId;
                availableRole.name = newName;
                availableRole.scopes = [...newScopes];
                availableRole.color = newColor;
                availableRole.orderIndex = effectiveOrderIndex;
            }
            sortAvailableRoles(classroomObj.availableRoles);
        }

        for (const student of Object.values(classroomObj.students || {})) {
            ensureStudentRoleBuckets(student);
            for (const roleRef of student.roles.class) {
                if (Number(roleRef.id) === Number(roleId)) {
                    roleRef.id = newRoleId;
                    roleRef.name = newName;
                }
            }
        }
    }

    return { id: newRoleId, name: newName, scopes: newScopes, color: newColor };
}

/**
 * Deletes a role from a class.
 * @param {number|string} roleId
 * @param {string|number} classId
 * @returns {Promise<void>}
 */
async function deleteClassRole(roleId, classId) {
    requireInternalParam(roleId, "roleId");
    requireInternalParam(classId, "classId");

    await backfillClassRoleOrderIndexes(classId);

    const role = await dbGet(
        `SELECT r.*
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE r.id = ? AND cr.classId = ?`,
        [roleId, classId]
    );
    if (!role) {
        throw new NotFoundError("Role not found in this class.");
    }

    await dbRun("DELETE FROM user_roles WHERE roleId = ? AND classId = ?", [roleId, classId]);
    await dbRun("DELETE FROM class_roles WHERE roleId = ? AND classId = ?", [roleId, classId]);

    if (role.isDefault !== 1) {
        await dbRun("DELETE FROM class_roles WHERE roleId = ?", [roleId]);
        await dbRun("DELETE FROM roles WHERE id = ?", [roleId]);
    }

    const classroom = classStateStore.getClassroom(classId);
    if (!classroom) {
        return;
    }

    if (classroom.customRoles) {
        delete classroom.customRoles[roleId];
    }
    if (Array.isArray(classroom.availableRoles)) {
        classroom.availableRoles = classroom.availableRoles.filter((availableRole) => Number(availableRole.id) !== Number(roleId));
    }
    for (const student of Object.values(classroom.students || {})) {
        ensureStudentRoleBuckets(student);
        student.roles.class = student.roles.class.filter((assignedRole) => Number(assignedRole.id) !== Number(roleId));
    }
}

/**
 * Adds a role to a student within a class.
 * @param {string|number} classId
 * @param {number} userId
 * @param {number|string} roleId
 * @param {Object} [actingClassUser]
 * @param {Object} [classroom]
 * @returns {Promise<void>}
 */
async function addStudentRole(classId, userId, roleId, actingClassUser, classroom) {
    requireInternalParam(classId, "classId");
    requireInternalParam(userId, "userId");
    requireInternalParam(roleId, "roleId");

    const role = await getRoleByIdForClass(classId, roleId);
    if (!role) {
        throw new ValidationError(`Role "${roleId}" does not exist in this class.`);
    }

    if (actingClassUser && classroom) {
        validateNoPrivilegeEscalationForRole(role, actingClassUser, classroom);
    }

    const classUser = await dbGet("SELECT 1 FROM classusers WHERE classId = ? AND studentId = ?", [classId, userId]);
    const classroomObj = classStateStore.getClassroom(classId);
    const activeStudent = await findActiveClassStudent(classroomObj, userId);
    const isActiveInClassroom = Boolean(activeStudent);
    if (!classUser && !isActiveInClassroom) {
        throw new NotFoundError("User is not a member of this class.");
    }

    const existing = await dbGet("SELECT 1 FROM user_roles WHERE userId = ? AND roleId = ? AND classId = ?", [userId, role.id, classId]);

    if (existing || hasInMemoryClassRole(activeStudent, role.id)) {
        throw new ValidationError(`User already has the "${role.name}" role.`);
    }

    if (classUser) {
        await dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, ?)", [userId, role.id, classId]);
    }

    if (activeStudent) {
        ensureStudentRoleBuckets(activeStudent);
        if (!activeStudent.roles.class.some((assignedRole) => Number(assignedRole.id) === Number(role.id))) {
            activeStudent.roles.class.push(buildRoleReference(role));
        }
    }
}

/**
 * Removes a role from a student within a class.
 * @param {string|number} classId
 * @param {number} userId
 * @param {number|string} roleId
 * @returns {Promise<void>}
 */
async function removeStudentRole(classId, userId, roleId) {
    requireInternalParam(classId, "classId");
    requireInternalParam(userId, "userId");
    requireInternalParam(roleId, "roleId");

    const role = await getRoleByIdForClass(classId, roleId);
    if (!role) {
        throw new ValidationError(`Role "${roleId}" does not exist in this class.`);
    }

    const existing = await dbGet("SELECT 1 FROM user_roles WHERE userId = ? AND roleId = ? AND classId = ?", [userId, role.id, classId]);
	
    const classroomObj = classStateStore.getClassroom(classId);
    const activeStudent = await findActiveClassStudent(classroomObj, userId);
    if (!existing && !hasInMemoryClassRole(activeStudent, role.id)) {
        throw new ValidationError(`User does not have the "${role.name}" role.`);
    }

    if (existing) {
        await dbRun(
            "DELETE FROM user_roles WHERE userId = ? AND roleId = ? AND classId = ?",
            [userId, role.id, classId]
        );
    }

    if (activeStudent) {
        ensureStudentRoleBuckets(activeStudent);
        activeStudent.roles.class = activeStudent.roles.class.filter((assignedRole) => Number(assignedRole.id) !== Number(role.id));
    }
}

/**
 * Loads a user's global roles plus class roles for the first in-memory class they belong to.
 * @param {number} userId
 * @returns {Promise<{global: Array<Object>, class: Array<Object>}>}
 */
async function getUserRoles(userId) {
    requireInternalParam(userId, "userId");

    const roles = {
        global: [],
        class: [],
    };

    const email = await getEmailFromId(userId);
    if (!email) {
        return roles;
    }

    const globalRoleRows = await dbGetAll(
        `SELECT r.id, r.name, r.scopes, r.color
         FROM user_roles ur
         JOIN roles r ON ur.roleId = r.id
         WHERE ur.classId IS NULL
           AND ur.userId = ?`,
        [userId]
    );
    roles.global = globalRoleRows.filter((role) => filterScopesByDomain(role.scopes, "global").length > 0);

    let classId = null;
    for (const classroom of Object.values(classStateStore.getAllClassrooms())) {
        if (classroom?.students?.[email]) {
            classId = classroom.id ?? classroom.classId;
            break;
        }
    }

    if (classId) {
        const classRoleRows = await dbGetAll(
            `SELECT DISTINCT r.id, r.name, r.scopes, r.color
             FROM user_roles ur
             JOIN roles r ON ur.roleId = r.id
             WHERE ur.userId = ?
               AND ur.classId = ?
             ORDER BY r.id`,
            [userId, classId]
        );
        roles.class = classRoleRows.filter((role) => filterScopesByDomain(role.scopes, "class").length > 0);
    }

    return roles;
}

/**
 * Gets all role names assigned to a student in a class.
 * @param {string|number} classId
 * @param {number} userId
 * @returns {Promise<string[]>}
 */
async function getStudentRoles(classId, userId) {
    requireInternalParam(classId, "classId");
    requireInternalParam(userId, "userId");

    const assignments = await getStudentRoleAssignments(classId, userId);
    return assignments.map((role) => role.name);
}

/**
 * Gets all role objects assigned to a student in a class.
 * @param {string|number} classId
 * @param {number} userId
 * @returns {Promise<Array<{id: number, name: string, scopes: string[], color: string, orderIndex: number|null}>>}
 */
async function getStudentRoleAssignments(classId, userId) {
    requireInternalParam(classId, "classId");
    requireInternalParam(userId, "userId");

    const rows = await dbGetAll(
        `SELECT r.id, r.name, r.scopes, r.color, cr.orderIndex
         FROM user_roles ur
         JOIN roles r ON ur.roleId = r.id
         LEFT JOIN class_roles cr ON cr.roleId = r.id AND cr.classId = ?
         WHERE ur.userId = ?
           AND ur.classId = ?
         ORDER BY ${CLASS_ROLE_ORDER_BY_SQL}`,
        [classId, userId, classId]
    );

    const assignments = rows.map((row) => buildRoleResponse(row));
    const existingRoleIds = new Set(assignments.map((role) => Number(role.id)));
    const classroomObj = classStateStore.getClassroom(classId);
    const activeStudent = await findActiveClassStudent(classroomObj, userId);
    const inMemoryRoleIds = (activeStudent?.roles?.class || [])
        .map((role) => Number(role?.id))
        .filter((roleId) => Number.isFinite(roleId) && !existingRoleIds.has(roleId));

    if (inMemoryRoleIds.length > 0) {
        const placeholders = inMemoryRoleIds.map(() => "?").join(", ");
        const missingRows = await dbGetAll(
            `SELECT r.id, r.name, r.scopes, r.color, cr.orderIndex
             FROM roles r
             JOIN class_roles cr ON cr.roleId = r.id
             WHERE cr.classId = ?
               AND r.id IN (${placeholders})`,
            [classId, ...inMemoryRoleIds]
        );
        assignments.push(...missingRows.map((row) => buildRoleResponse(row)));
        sortAvailableRoles(assignments);
    }

    return assignments;
}

/**
 * Assigns a single role to a student, replacing all existing roles.
 * @param {string|number} classId
 * @param {number} userId
 * @param {string} roleName
 * @returns {Promise<void>}
 */
async function assignStudentRole(classId, userId, roleName) {
    requireInternalParam(classId, "classId");
    requireInternalParam(userId, "userId");
    requireInternalParam(roleName, "roleName");

    await backfillClassRoleOrderIndexes(classId);

    const classRole = await dbGet(
        `SELECT r.id
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE r.name = ? AND cr.classId = ?`,
        [roleName, classId]
    );
    if (!classRole && roleName !== ROLE_NAMES.GUEST) {
        throw new ValidationError(`Role "${roleName}" does not exist in this class.`);
    }

    const classUser = await dbGet("SELECT 1 FROM classusers WHERE classId = ? AND studentId = ?", [classId, userId]);
    if (!classUser) {
        throw new NotFoundError("User is not a member of this class.");
    }

    await dbRun("DELETE FROM user_roles WHERE userId = ? AND classId = ?", [userId, classId]);

    if (roleName !== ROLE_NAMES.GUEST) {
        await dbRun("INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, ?)", [userId, classRole.id, classId]);
    }

    const classroom = classStateStore.getClassroom(classId);
    if (classroom) {
        const email = await getEmailFromId(userId);
        if (email && classroom.students[email]) {
            const student = classroom.students[email];
            ensureStudentRoleBuckets(student);
            student.roles.class = roleName === ROLE_NAMES.GUEST ? [] : buildRoleReferences([getAvailableRoleByName(classroom, roleName)]);
        }
    }
}

/**
 * Loads class-scoped roles for a class from the database.
 * @param {string|number} classId
 * @returns {Promise<Object<string, string[]>>}
 */
async function loadCustomRoles(classId) {
    await backfillClassRoleOrderIndexes(classId);

    const rows = await dbGetAll(
        `SELECT r.id, r.scopes
         FROM roles r
         JOIN class_roles cr ON cr.roleId = r.id
         WHERE cr.classId = ?`,
        [classId]
    );
    const customRoles = {};
    for (const row of rows) {
        customRoles[row.id] = parseScopesField(row.scopes);
    }
    return customRoles;
}

/**
 * Validates that a role name is present and within length limits.
 * @param {string} name
 * @returns {void}
 */
function validateRoleName(name) {
    if (typeof name !== "string" || name.trim().length === 0) {
        throw new ValidationError("Role name must be a non-empty string.");
    }
    if (name.length > 50) {
        throw new ValidationError("Role name cannot exceed 50 characters.");
    }
}

/**
 * Validates that every provided scope is a known class scope.
 * @param {unknown} scopes
 * @returns {void}
 */
function validateScopes(scopes) {
    if (!Array.isArray(scopes)) {
        throw new ValidationError("Scopes must be an array of strings.");
    }
    const validScopes = getValidClassScopes();
    for (const scope of scopes) {
        if (typeof scope !== "string") {
            throw new ValidationError("Each scope must be a string.");
        }
        if (!validScopes.has(scope)) {
            throw new ValidationError(`Invalid scope: "${scope}".`);
        }
    }
}

/**
 * Prevents callers from granting scopes they do not currently hold.
 * @param {string[]} scopes
 * @param {Object} actingClassUser
 * @param {Object} classroom
 * @returns {void}
 */
function validateNoPrivilegeEscalation(scopes, actingClassUser, classroom) {
    const userScopes = getUserScopes(actingClassUser, classroom);
    const actorScopes = new Set([...userScopes.global, ...userScopes.class]);
    const globalRoleName = getUserRoleName(actingClassUser);
    if (globalRoleName && ROLES[globalRoleName]?.global) {
        for (const scope of ROLES[globalRoleName].global) {
            actorScopes.add(scope);
        }
    }

    for (const scope of scopes) {
        if (!actorScopes.has(scope)) {
            throw new ForbiddenError(`Cannot grant scope "${scope}" — you do not have it yourself.`);
        }
    }
}

/**
 * Prevents callers from assigning roles that grant scopes they do not already hold.
 * @param {{name: string, scopes: string|string[]|null|undefined}} role
 * @param {Object} actingClassUser
 * @param {Object} classroom
 * @returns {void}
 */
function validateNoPrivilegeEscalationForRole(role, actingClassUser, classroom) {
    const roleScopes = buildRoleResponse(role).scopes;
    validateNoPrivilegeEscalation(roleScopes, actingClassUser, classroom);
}

/**
 * Resolves the acting classroom user from either the student roster or owner fallback.
 * @param {Object|null} classroom
 * @param {{id: number, email: string, roles?: {global?: Array<Object>}}} reqUser
 * @returns {Object|null}
 */
function getActingUser(classroom, reqUser) {
    if (!classroom) return null;
    const student = classroom.students?.[reqUser.email];
    if (student) return student;

    if (classroom.owner === reqUser.id || classroom.owner === reqUser.email) {
        return {
            id: reqUser.id,
            email: reqUser.email,
            roles: { global: reqUser.roles?.global || [], class: [] },
            isClassOwner: true,
        };
    }
    return null;
}

module.exports = {
    getUserRoles,
    getClassRoles,
    createClassRole,
    updateClassRole,
    deleteClassRole,
    addStudentRole,
    removeStudentRole,
    getStudentRoles,
    getStudentRoleAssignments,
    assignStudentRole,
    loadCustomRoles,
    getActingUser,
    findRoleByPermissionLevel,
    addDefaultClassRoles,
    backfillClassRoleOrderIndexes,

    BUILT_IN_ROLE_NAMES,
};
