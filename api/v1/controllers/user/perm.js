const { classInformation } = require("@modules/class/classroom");
const { dbRun } = require("@modules/database");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permissionCheck");
const ValidationError = require("@errors/validation-error");

module.exports = (router) => {
    // Change a user's global permissions
    router.post("/user/:email/perm", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const email = req.params.email;
        let { perm } = req.body || {};
        perm = Number(perm);
        if (!Number.isFinite(perm)) {
            throw new ValidationError("Invalid permission value");
        }

        await dbRun("UPDATE users SET permissions=? WHERE email=?", [perm, email]);
        if (classInformation.users[email]) {
            classInformation.users[email].permissions = perm;
        }

        res.status(200).json({ ok: true });
    });
};
