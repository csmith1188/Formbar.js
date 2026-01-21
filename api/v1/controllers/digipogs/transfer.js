const { logger } = require("@modules/logger");
const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { transferDigipogs } = require("@modules/digipogs");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    // Transfers digipogs from one user to another
    router.post("/digipogs/transfer", httpPermCheck("transfer"), async (req, res) => {
        const result = await transferDigipogs(req.body);
        if (!result.success) {
            throw new AppError(result);
        }
        res.status(200).json(result);
    });
};
