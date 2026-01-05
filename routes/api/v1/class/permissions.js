const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");

module.exports = {
    run(router) {
        // Gets the permissions of a class
        router.get("/class/:id/permissions", async (req, res) => {
            try {
                // Get the class key from the request parameters and log the request details
                let classId = req.params.id;
                logger.log("info", `[get api/class/${classId}/permissions] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                // Get a clone of the class data
                // If the class does not exist, return an error
                let classData = structuredClone(classInformation.classrooms[classId]);
                if (!classData) {
                    res.status(404).json({ error: "Class not started" });
                    return;
                }

                // Get the user from the session
                // If the user is not in the class, return an error
                const user = req.session.user;
                if (!classData.students[user.email]) {
                    logger.log("verbose", `[get api/class/${classId}/permissions] user is not logged in`);
                    res.status(403).json({ error: "User is not logged into the selected class" });
                    return;
                }

                // Send the class permissions as a JSON response
                res.status(200).json(classData.permissions);
            } catch (err) {
                // If an error occurs, log the error and send an error message as a JSON response
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    },
};
