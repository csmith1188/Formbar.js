// 25_role_id_refactor.js
// Finalizes the role-based permission system by:
//   1. Adding color column to roles table and seeding built-in colors.
//   2. Migrating users.role / users.permissions → user_roles (global, classId=NULL).
//   3. Dropping legacy columns: users.permissions, users.role,
//      classusers.permissions, classusers.role, classroom.permissions.
//   4. Dropping the class_permissions table entirely.
// Idempotent: safe to run multiple times on the same database.

const { dbRun, dbGetAll, dbGet } = require("@modules/database");

const PERMISSIONS_TO_ROLE = {
    0: "Banned",
    1: "Guest",
    2: "Student",
    3: "Mod",
    4: "Teacher",
    5: "Manager",
};

const ROLE_COLORS = {
    Banned: "#808080",
    Guest: "#95A5A6",
    Student: "#3498DB",
    Mod: "#2ECC71",
    Teacher: "#F39C12",
    Manager: "#E74C3C",
};

module.exports = {
    async run(database) {
        // ---------------------------------------------------------------
        // 1. Add `color` column to roles table
        // ---------------------------------------------------------------
        const rolesColumns = await dbGetAll("PRAGMA table_info(roles)", [], database);
        if (!rolesColumns.some((col) => col.name === "color")) {
            await dbRun(`ALTER TABLE "roles" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#808080'`, [], database);
        }

        // Seed colors for global built-in roles
        for (const [name, color] of Object.entries(ROLE_COLORS)) {
            await dbRun(
                `UPDATE "roles"
                 SET "color" = ?
                 WHERE "name" = ?
                   AND "isDefault" = 1`,
                [color, name],
                database
            );
        }

        // Also update class-associated default roles that share a built-in name
        for (const [name, color] of Object.entries(ROLE_COLORS)) {
            await dbRun(
                `UPDATE "roles"
                 SET "color" = ?
                 WHERE "name" = ?
                   AND "isDefault" = 1
                   AND "color" = '#808080'
                   AND EXISTS (SELECT 1 FROM class_roles cr WHERE cr.roleId = roles.id)`,
                [color, name],
                database
            );
        }

        // ---------------------------------------------------------------
        // 2. Migrate users.role / users.permissions → user_roles
        // ---------------------------------------------------------------
        const usersColumns = await dbGetAll("PRAGMA table_info(users)", [], database);
        const hasRole = usersColumns.some((col) => col.name === "role");
        const hasPermissions = usersColumns.some((col) => col.name === "permissions");

        if (hasRole || hasPermissions) {
            const users = await dbGetAll("SELECT * FROM users", [], database);

            for (const user of users) {
                // Determine role name: prefer users.role, fall back to permissions mapping
                let roleName = null;
                if (hasRole && user.role) {
                    roleName = user.role;
                } else if (hasPermissions && user.permissions != null) {
                    roleName = PERMISSIONS_TO_ROLE[user.permissions] || null;
                }

                // Look up the global role ID
                const role = await dbGet(
                    `SELECT r.id
                                         FROM roles r
                                         WHERE r.name = ?
                                             AND r.isDefault = 1`,
                    [roleName],
                    database
                );
                if (!role) continue;

                // Insert only if not already present
                const existing = await dbGet(
                    `SELECT 1 FROM user_roles WHERE userId = ? AND roleId = ? AND COALESCE(classId, -1) = -1`,
                    [user.id, role.id],
                    database
                );
                if (!existing) {
                    await dbRun(`INSERT INTO user_roles (userId, roleId, classId) VALUES (?, ?, NULL)`, [user.id, role.id], database);
                }
            }
        }

        // ---------------------------------------------------------------
        // 3. Drop users.permissions and users.role via table recreation
        // ---------------------------------------------------------------
        if (hasRole || hasPermissions) {
            const hasPin = usersColumns.some((col) => col.name === "pin");

            await dbRun(`DROP TABLE IF EXISTS "users_new"`, [], database);
            await dbRun(
                `CREATE TABLE "users_new" (
                    "id"          INTEGER NOT NULL UNIQUE,
                    "email"       TEXT    NOT NULL UNIQUE,
                    "password"    TEXT,
                    "API"         TEXT    NOT NULL UNIQUE,
                    "secret"      TEXT    NOT NULL UNIQUE,
                    "tags"        TEXT,
                    "digipogs"    INTEGER NOT NULL DEFAULT 0,
                    "pin"         TEXT    DEFAULT NULL,
                    "displayName" TEXT,
                    "verified"    INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY ("id" AUTOINCREMENT)
                )`,
                [],
                database
            );

            await dbRun(
                `INSERT INTO "users_new" ("id", "email", "password", "API", "secret", "tags", "digipogs", "pin", "displayName", "verified")
                 SELECT "id", "email", "password", "API", "secret", "tags", "digipogs", ${hasPin ? '"pin"' : "NULL"}, "displayName", "verified"
                 FROM "users"`,
                [],
                database
            );

            await dbRun(`DROP TABLE "users"`, [], database);
            await dbRun(`ALTER TABLE "users_new" RENAME TO "users"`, [], database);

            // Recreate indexes
            try {
                await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_display_name_unique" ON "users" ("displayName")`, [], database);
            } catch (e) {
                // Index may already exist
            }
        }

        // ---------------------------------------------------------------
        // 4. Drop classusers.permissions and classusers.role via table recreation
        // ---------------------------------------------------------------
        const cuColumns = await dbGetAll("PRAGMA table_info(classusers)", [], database);
        const cuHasPermissions = cuColumns.some((col) => col.name === "permissions");
        const cuHasRole = cuColumns.some((col) => col.name === "role");

        if (cuHasPermissions || cuHasRole) {
            // Determine which columns to keep
            const cuHasDigiPogs = cuColumns.some((col) => col.name === "digiPogs");
            const cuHasTags = cuColumns.some((col) => col.name === "tags");

            const keepCols = ['"classId"', '"studentId"'];
            if (cuHasDigiPogs) keepCols.push('"digiPogs"');
            if (cuHasTags) keepCols.push('"tags"');

            const colDefs = ['"classId"   INTEGER NOT NULL', '"studentId" INTEGER NOT NULL'];
            if (cuHasDigiPogs) colDefs.push('"digiPogs" INTEGER');
            if (cuHasTags) colDefs.push('"tags" TEXT');

            await dbRun(`CREATE TABLE IF NOT EXISTS "classusers_new" (${colDefs.join(", ")})`, [], database);

            await dbRun(
                `INSERT INTO "classusers_new" (${keepCols.join(", ")})
                 SELECT ${keepCols.join(", ")} FROM "classusers"`,
                [],
                database
            );

            await dbRun(`DROP TABLE "classusers"`, [], database);
            await dbRun(`ALTER TABLE "classusers_new" RENAME TO "classusers"`, [], database);
        }

        // ---------------------------------------------------------------
        // 5. Drop class_permissions table
        // ---------------------------------------------------------------
        await dbRun(`DROP TABLE IF EXISTS "class_permissions"`, [], database);

        // ---------------------------------------------------------------
        // 6. Remove permissions column from classroom table
        // ---------------------------------------------------------------
        const classroomColumns = await dbGetAll("PRAGMA table_info(classroom)", [], database);
        const classroomHasPermissions = classroomColumns.some((col) => col.name === "permissions");

        if (classroomHasPermissions) {
            await dbRun(
                `CREATE TABLE IF NOT EXISTS "classroom_new" (
                    "id"       INTEGER NOT NULL UNIQUE,
                    "name"     TEXT    NOT NULL,
                    "owner"    INTEGER NOT NULL,
                    "key"      INTEGER NOT NULL,
                    "tags"     TEXT,
                    "settings" TEXT,
                    PRIMARY KEY ("id" AUTOINCREMENT)
                )`,
                [],
                database
            );

            await dbRun(
                `INSERT INTO "classroom_new" ("id", "name", "owner", "key", "tags", "settings")
                 SELECT "id", "name", "owner", "key", "tags", "settings"
                 FROM "classroom"`,
                [],
                database
            );

            await dbRun(`DROP TABLE "classroom"`, [], database);
            await dbRun(`ALTER TABLE "classroom_new" RENAME TO "classroom"`, [], database);
        }

        console.log("Migration 25 completed: role ID refactor — legacy permission columns removed.");
    },
};
