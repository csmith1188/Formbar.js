const { isAuthenticated, permCheck } = require("@modules/middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { getUserJoinedClasses, isUserInClass, getClassCode, getClassIdByCode } = require("@services/class-service");
const { database } = require("@modules/database");
const { joinRoomByCode } = require("@modules/joinRoom");
const { logger } = require("@modules/logger");
const { setClassOfApiSockets, userSockets, emitToUser } = require("@modules/socketUpdates");

module.exports = (router) => {
    router.get("/selectClass", isAuthenticated, permCheck, async (req, res) => {
        try {
            logger.log("info", `[get /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

            let joinedClasses = await getUserJoinedClasses(req.session.user.id);
            joinedClasses = joinedClasses.filter((classroom) => classroom.permissions !== 0);

            res.json({ joinedClasses: joinedClasses });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: `There was a server error. Try again.` });
        }
    });

    router.post("/selectClass", isAuthenticated, permCheck, async (req, res) => {
        try {
            let classId = req.body.id;
            let classCode = req.body.key;

            // Validate that either classId or classCode is provided
            if (!classCode && !classId) {
                return res.status(400).json({ error: "Either class ID or class code must be provided." });
            }

            if (!classCode) {
                // Check if the user is in the class with the class id provided
                const userInClass = await isUserInClass(req.session.user.id, classId);

                if (!userInClass) {
                    return res.status(403).json({ error: "You do not have permission to access this class." });
                }

                classCode = await getClassCode(classId);

                if (!classCode) {
                    return res.status(404).json({ error: "Class not found." });
                }
            }

            logger.log("info", `[post /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) classCode=(${classCode})`);
            const classJoinStatus = await joinRoomByCode(classCode, req.session.user);
            if (typeof classJoinStatus === "string") {
                // joinRoomByCode returned an error message
                return res.status(400).json({ error: classJoinStatus });
            }

            // If class code is provided, get classId
            if (classCode) {
                classCode = classCode.toLowerCase();

                classId = await getClassIdByCode(classCode);
                if (!classId) {
                    return res.status(404).json({ error: "Class not found." });
                }

                req.session.classId = classId;
            }

            await setClassOfApiSockets(classInformation.users[req.session.email].API, classId);
            if (userSockets[req.session.email] && Object.keys(userSockets[req.session.email]).length > 0) {
                await emitToUser(req.session.email, "reload");
            }
            res.json({ success: true });
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: `There was a server error. Try again.` });
        }
    });
};
