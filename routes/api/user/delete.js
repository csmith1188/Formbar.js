const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { createSocketFromHttp } = require("../../../modules/webServer");
const { deleteUser } = require("../../../modules/user");

module.exports = {
    run(router) {
        // Retrieves the current class the user is in
        router.get('/user/:id/delete', httpPermCheck("deleteUser"), async (req, res) => {
            try {
                const userId = req.params.id;
                const socket = createSocketFromHttp(req, res);

                await deleteUser(userId, socket)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}