const { isAuthenticated, permCheck } = require("@modules/middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { getUserJoinedClasses, isUserInClass, getClassCode, getClassIdByCode, joinClass } = require("@services/class-service");
const { joinRoomByCode } = require("@services/room-service");
const { logger } = require("@modules/logger");
const { setClassOfApiSockets, userSockets, emitToUser } = require("@modules/socket-updates");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");
const NotFoundError = require("@errors/not-found-error");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/selectClass:
     *   get:
     *     summary: Get user's joined classes
     *     tags:
     *       - Class
     *     description: Returns a list of classes the authenticated user has joined (excluding guest permissions)
     *     responses:
     *       200:
     *         description: List of joined classes retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 joinedClasses:
     *                   type: array
     *                   items:
     *                     type: object
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.get("/selectClass", isAuthenticated, permCheck, async (req, res) => {
        logger.log("info", `[get /selectClass] ip=(${req.ip}) user=(${req.user?.email})`);

        let joinedClasses = await getUserJoinedClasses(req.user.id);
        joinedClasses = joinedClasses.filter((classroom) => classroom.permissions !== 0);

        res.json({ joinedClasses: joinedClasses });
    });

    /**
     * @swagger
     * /api/v1/selectClass:
     *   post:
     *     summary: Select and join a class
     *     tags:
     *       - Class
     *     description: Allows a user to select and join a class by providing either a class ID or class code
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               id:
     *                 type: string
     *                 description: Class ID to join
     *               key:
     *                 type: string
     *                 description: Class code to join
     *     responses:
     *       200:
     *         description: Successfully joined the class
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *       400:
     *         description: Bad request - invalid parameters or join error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       403:
     *         description: Forbidden - no permission to access class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       404:
     *         description: Class not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/NotFoundError'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ServerError'
     */
    router.post("/selectClass", isAuthenticated, permCheck, async (req, res) => {
        let classId = req.body.id;
        let classCode = req.body.key;

        // Validate that either classId or classCode is provided
        if (!classCode && !classId) {
            throw new ValidationError("Either class ID or class code must be provided.");
        }

        // If classId is provided, user is re-joining a class they're already a member of
        if (classId && !classCode) {
            // Check if the user is in the class with the class id provided
            const userInClass = await isUserInClass(req.user.id, classId);

            if (!userInClass) {
                throw new ForbiddenError("You do not have permission to access this class.");
            }

            logger.log("info", `[post /selectClass] ip=(${req.ip}) user=(${req.user?.email}) classId=(${classId})`);

            // Use joinClass for re-joining by ID
            await joinClass(req.user, classId);
        } else {
            // User is joining with a code (first time or with explicit code)
            if (!classCode) {
                classCode = await getClassCode(classId);
                if (!classCode) {
                    throw new NotFoundError("Class not found.");
                }
            }

            logger.log("info", `[post /selectClass] ip=(${req.ip}) user=(${req.user?.email}) classCode=(${classCode})`);

            // Use joinRoomByCode for first-time joins with code
            const classJoinStatus = await joinRoomByCode(classCode, req.user);
            if (typeof classJoinStatus === "string") {
                // joinRoomByCode returned an error message
                throw new AppError(classJoinStatus);
            }

            // Get classId from code
            classCode = classCode.toLowerCase();
            classId = await getClassIdByCode(classCode);
            if (!classId) {
                throw new NotFoundError("Class not found.");
            }
        }

        // Update classInformation for the user
        if (classInformation.users[req.user.email]) {
            classInformation.users[req.user.email].activeClass = classId;
        }

        await setClassOfApiSockets(classInformation.users[req.user.email]?.API, classId);
        if (userSockets[req.user.email] && Object.keys(userSockets[req.user.email]).length > 0) {
            await emitToUser(req.user.email, "reload");
        }
        res.json({ success: true });
    });
};
