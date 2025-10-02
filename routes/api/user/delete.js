const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { deleteUser } = require("../../../modules/user/userSession");

module.exports = {
    run(router) {
        // Deletes a user from Formbar
        router.get('/user/:id/delete', httpPermCheck("deleteUser"), async (req, res) => {
            try {
                const userId = req.params.id;
                const result = await deleteUser(userId)
                if (result === true) {
                    res.status(200);
                } else {
                    res.status(500).json({ error: result });
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}