const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { joinClass, joinRoom } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Joins the current class session
        router.post('/class/:id/join', httpPermCheck("joinClass"), async (req, res) => {
            try {
                joinClass(req.session)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });

        // Joins a classroom
        router.post('/class/:code/join', httpPermCheck("joinRoom"), async (req, res) => {
            try {
                await joinRoom(req.session, req.params.code)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}