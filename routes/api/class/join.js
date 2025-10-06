const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { joinClass } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Joins the current class session
        router.post('/class/:id/join', httpPermCheck("joinClass"), async (req, res) => {
            try {
                joinClass(req.session)
                res.status(200).json({ message: 'Success' });
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}