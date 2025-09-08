const { createSocketFromHttp } = require("../../../modules/webServer");
const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { joinClass, joinClassroom } = require("../../../modules/class/class");

module.exports = {
    run(router) {
        // Joins the current class session
        router.post('/class/:id/joinSession', httpPermCheck("joinClass"), async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                joinClass(socket)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });

        // Joins a classroom
        router.post('/class/:id/join', httpPermCheck("joinClassroom"), async (req, res) => {
            try {
                const socket = createSocketFromHttp(req, res);
                await joinClassroom(socket)
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}