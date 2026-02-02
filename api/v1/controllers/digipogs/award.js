const { hasClassPermission } = require("@middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("@modules/permissions");
const { awardDigipogs } = require("@modules/digipogs");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Awards digipogs to a user
    router.post("/digipogs/award", hasClassPermission(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
        const result = await awardDigipogs(req.body, req.session);
        if (!result.success) {
            throw new AppError(result);
        }
        res.status(200).json(result);
    });
};
