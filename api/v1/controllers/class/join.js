const { httpPermCheck } = require("@modules/middleware/permission-check");
const { joinClass } = require("@modules/class/class");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/join:
     *   post:
     *     summary: Join a class session
     *     tags:
     *       - Class
     *     description: |
     *       Joins the current class session as a participant.
     *
     *       **Required Permission:** Global Guest permission (level 1)
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
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *     responses:
     *       200:
     *         description: Successfully joined the class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/SuccessResponse'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: Unauthorized to join this class
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post("/class/:id/join", httpPermCheck("joinClass"), async (req, res) => {
        await joinClass(req.session, req.params.id);
        res.status(200).json({ success: true });
    });
};
