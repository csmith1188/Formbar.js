const { logger } = require("../../../modules/logger");
const { classPermCheck } = require("../../middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("../../../modules/permissions");
const { awardDigipogs } = require("../../../modules/digipogs");

module.exports = {
    run(router) {
        // Awards digipogs to a user
        router.post('/digipogs/award', classPermCheck(CLASS_PERMISSIONS.MANAGE_CLASS), async (req, res) => {
            try {
                const result = await awardDigipogs(req.body);
                if (result.success) {
                    res.status(200).json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}