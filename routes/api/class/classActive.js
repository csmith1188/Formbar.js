const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { isClassActive } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Retrieves whether a class is currently active or not from the class ID provided
        router.get('/class/:id/active', async (req, res) => {
            try {
                const classId = req.params.id;
                const hasPerms = await httpPermCheck("isClassActive", req, res);
                if (!hasPerms) {
                    return;
                }

                const isActive = isClassActive(classId);
                const socket = createSocketFromHttp(req, res);
                res.status(200).json({ isActive });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        });
    }
}