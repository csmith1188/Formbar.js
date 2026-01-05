const { classInformation } = require("../../../../modules/class/classroom");
const { logger } = require("../../../../modules/logger");
const { dbRun } = require("../../../../modules/database");
const { MANAGER_PERMISSIONS } = require("../../../../modules/permissions");
const { hasPermission } = require("../../../middleware/permissionCheck");

module.exports = {
    run(router) {
        // Change a user's global permissions
        router.post("/user/:email/perm", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
            try {
                const email = req.params.email;
                let { perm } = req.body || {};
                perm = Number(perm);
                if (!Number.isFinite(perm)) return res.status(400).json({ error: "Invalid permission value" });

                await dbRun("UPDATE users SET permissions=? WHERE email=?", [perm, email]);
                if (classInformation.users[email]) {
                    classInformation.users[email].permissions = perm;
                }

                res.status(200).json({ ok: true });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    },
};
