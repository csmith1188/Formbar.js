const { httpPermCheck } = require("../../../middleware/permissionCheck");
const { classInformation } = require("../../../../modules/class/classroom");
const { requestBreak } = require("../../../../modules/class/break");

module.exports = {
    run(router) {
        // Request a break in a class by class ID and user ID
        router.post('/class/:id/break/request', httpPermCheck("requestBreak"), async (req, res) => {
            try {
                const classId = req.params.id;
                const classroom = classInformation.classrooms[classId];
                if (classroom && !classroom.students[req.session.email]) {
                    res.status(403).json({ error: "You do not have permission to request a break." });
                    return;
                }

                if (!req.body.reason) {
                    res.status(400).json({ error: "A reason for the break must be provided." });
                    return;
                }

                const result = requestBreak(req.body.reason, req.session.user);
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