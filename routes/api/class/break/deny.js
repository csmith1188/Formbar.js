const { httpPermCheck } = require("../../../middleware/permissionCheck");
const { classInformation } = require("../../../../modules/class/classroom");
const { approveBreak } = require("../../../../modules/class/break");

module.exports = {
    run(router) {
        // Approves a break in a class by class ID and user ID
        router.post("/class/:id/students/:userId/break/deny", httpPermCheck("approveBreak"), async (req, res) => {
            try {
                const classId = req.params.id;
                const classroom = classInformation.classrooms[classId];
                if (classroom && !classroom.students[req.session.email]) {
                    res.status(403).json({ error: "You do not have permission to approve this user's break." });
                    return;
                }

                const result = approveBreak(false, req.params.userId, req.session.user);
                if (result === true) {
                    res.status(200);
                } else {
                    res.status(500).json({ error: result });
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    },
};
