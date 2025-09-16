const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { deleteUser } = require("../../../modules/user");

module.exports = {
    run(router) {
        // Retrieves the current class the user is in
        router.get('/user/:id/delete', httpPermCheck("deleteUser"), async (req, res) => {
            try {
                const userId = req.params.id;
                await deleteUser(userId)
                res.status(200).json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}