const { isAuthenticated, permCheck } = require("@middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { getUserJoinedClasses, isUserInClass, getClassCode, getClassIdByCode } = require("@services/class-service");
const { joinRoomByCode } = require("@modules/joinRoom");
const { logger } = require("@modules/logger");
const { setClassOfApiSockets, userSockets, emitToUser } = require("@modules/socketUpdates");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    router.get("/selectClass", isAuthenticated, permCheck, async (req, res) => {
        let joinedClasses = await getUserJoinedClasses(req.session.user.id);
        joinedClasses = joinedClasses.filter((classroom) => classroom.permissions !== 0);

        res.json({ joinedClasses: joinedClasses });
    });

    router.post("/selectClass", isAuthenticated, permCheck, async (req, res) => {
        let classId = req.body.id;
        let classCode = req.body.key;

        // Validate that either classId or classCode is provided
        if (!classCode && !classId) {
            throw new ValidationError("Either class ID or class code must be provided.");
        }

        if (!classCode) {
            // Check if the user is in the class with the class id provided
            const userInClass = await isUserInClass(req.session.user.id, classId);

            if (!userInClass) {
                throw new ForbiddenError("You do not have permission to access this class.");
            }

            classCode = await getClassCode(classId);

            if (!classCode) {
                throw new NotFoundError("Class not found.");
            }
        }

        const classJoinStatus = await joinRoomByCode(classCode, req.session.user);
        if (typeof classJoinStatus === "string") {
            // joinRoomByCode returned an error message
            throw new AppError(classJoinStatus);
        }

        // If class code is provided, get classId
        classCode = classCode.toLowerCase();

        classId = await getClassIdByCode(classCode);
        if (!classId) {
            throw new NotFoundError("Class not found.");
        }

        req.session.classId = classId;

        await setClassOfApiSockets(classInformation.users[req.session.email].API, classId);
        if (userSockets[req.session.email] && Object.keys(userSockets[req.session.email]).length > 0) {
            await emitToUser(req.session.email, "reload");
        }
        res.json({ success: true });
    });
};
