const { MANAGER_PERMISSIONS } = require("@modules/permissions");
const { logger } = require("@modules/logger");
const { getManagerData } = require("@services/manager-service");
const { hasPermission } = require("@middleware/permission-check");
const { isAuthenticated } = require("@middleware/authentication");

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
     *       - apiKeyAuth: []
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
    router.get("/manager", isAuthenticated, hasPermission(MANAGER_PERMISSIONS), async (req, res) => {
        const user = req.user;
        req.infoEvent("manager.view", `Manager dashboard accessed`, { user: req.user?.email, ip: req.ip });
        req.infoEvent("manager.response", `Manager data retrieved`, { user: req.user?.email, userId: user.id });

        // Grab manager data and send it back as a JSON response
        const { users, classrooms } = await getManagerData();
        res.status(200).json({
            success: true,
            data: {
                users,
                classrooms,
            },
        });
    });
};
