const { httpPermCheck } = require("../../middleware/permissionCheck");
const { classInformation } = require("@modules/class/classroom");
const { sendHelpTicket } = require("@modules/class/help");

module.exports = (router) => {
    try {
        // request help in a class by class ID
        router.get("/class/:id/help/request", httpPermCheck("help"), async (req, res) => {
            try {
                const classId = req.params.id;
                const classroom = classInformation.classrooms[classId];
                if (classroom && !classroom.students[req.session.email]) {
                    res.status(403).json({ error: "You do not have permission to request help in this class." });
                    return;
                }

                const result = await sendHelpTicket(true, req.params.userId, req.session.user);
                if (result === true) {
                    res.status(200).json({ message: "Success" });
                } else {
                    res.status(500).json({ error: result });
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
