const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { logger } = require("@modules/logger");
const { getManagerData } = require("@modules/manager");
const { hasPermission } = require("@modules/middleware/permission-check");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/manager:
     *   get:
     *     summary: Get manager data
     *     tags:
     *       - Manager
     *     description: |
     *       Retrieves all users and classrooms for manager view.
     *
     *       **Required Permission:** Global Manager permission (level 5)
     *
     *       **Permission Levels:**
     *       - 1: Guest
     *       - 2: Student
     *       - 3: Moderator
     *       - 4: Teacher
     *       - 5: Manager
     *     security:
     *       - bearerAuth: []
     *       - sessionAuth: []
     *     responses:
     *       200:
     *         description: Manager data retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ManagerData'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Insufficient permissions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.get("/manager", hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        // Grab the user from the session
        const user = req.session.user;
        logger.log("info", `[get api/manager] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
        logger.log("verbose", `[get api/manager] response=(${JSON.stringify(user)})`);

        // Grab manager data and send it back as a JSON response
        const { users, classrooms } = await getManagerData();
        res.status(200).json({
            users,
            classrooms,
        });
    });
};
