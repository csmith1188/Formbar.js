const { deleteUser } = require("@modules/user/userSession");
const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { hasPermission } = require("@middleware/permissionCheck");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Deletes a user from Formbar
    router.get("/user/:id/delete", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const userId = req.params.id;
        const result = await deleteUser(userId);
        if (result === true) {
            res.status(200).json({ success: true });
        } else {
            throw new AppError(result);
        }
    });
};
