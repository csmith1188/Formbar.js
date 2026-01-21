const { logger } = require("@modules/logger");
const { dbRun, dbGetAll } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@modules/middleware/permissionCheck");
const jwt = require("jsonwebtoken");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    // Verify a pending user
    router.post("/user/:id/verify", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const id = req.params.id;
        const tempUsers = await dbGetAll("SELECT * FROM temp_user_creation_data");
        let tempUser;
        for (const user of tempUsers) {
            const userData = jwt.decode(user.token);
            if (userData.newSecret == id) {
                tempUser = userData;
                break;
            }
        }

        if (!tempUser) {
            throw new NotFoundError("Pending user not found");
        }

        await dbRun("INSERT INTO users (email, password, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            tempUser.email,
            tempUser.hashedPassword,
            tempUser.permissions,
            tempUser.newAPI,
            tempUser.newSecret,
            tempUser.displayName,
            1,
        ]);
        await dbRun("DELETE FROM temp_user_creation_data WHERE secret=?", [tempUser.newSecret]);
        res.status(200).json({ ok: true });
    });
};
