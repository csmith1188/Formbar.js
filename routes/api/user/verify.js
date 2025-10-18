const { logger } = require("../../../modules/logger");
const { dbRun, dbGetAll } = require("../../../modules/database");
const jwt = require("jsonwebtoken");
const { hasPermission } = require("../../middleware/permissionCheck");
const { MANAGER_PERMISSIONS } = require("../../../modules/permissions");

module.exports = {
    run(router) {
        // Verify a pending user
        router.post("/user/:id/verify", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
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

                if (!tempUser) return res.status(404).json({ error: "Pending user not found" });

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
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    },
};
