const { requireQueryParam } = require("@modules/error-wrapper");
const { getPreviousPolls } = require("@services/poll-service");
const { classStateStore } = require("@services/classroom-service");
const { isAuthenticated } = require("@middleware/authentication");
const { hasClassScope, isOwnerOrHasScopes } = require("@middleware/permission-check");
const { SCOPES } = require("@modules/permissions");
const { buildPagination, parsePaginationQuery } = require("@modules/pagination");
const membershipService = require("@services/class-membership-service");

const DEFAULT_POLL_LIMIT = 20;
const MAX_POLL_LIMIT = 100;

/**
 * Register polls controller routes.
 * @param {import("express").Router} router - router.
 * @returns {void}
 */
module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/class/{id}/polls:
     *   get:
     *     summary: Get polls in a class
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns the poll history data for a class, excluding responses. Results are paginated.
     *     
	 *       **Required Permission:** `CLASS.POLL.READ`
     *
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *       - in: query
     *         name: limit
     *         required: false
     *         schema:
     *           type: integer
     *           default: 20
     *           minimum: 1
     *           maximum: 100
     *         description: Maximum number of polls to return
     *       - in: query
     *         name: offset
     *         required: false
     *         schema:
     *           type: integer
     *           default: 0
     *           minimum: 0
     *         description: Number of polls to skip before returning results
     *     responses:
     *       200:
     *         description: Poll data retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   type: object
     *                   properties:
     *                     polls:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           pollId:
     *                             type: integer
     *                             description: Class-relative poll ID (increments within a class)
     *                             example: 12
     *                           prompt:
     *                             type: string
     *                             description: Poll prompt shown to students
     *                             example: True/False
     *                           responses:
     *                             type: array
     *                             description: Poll options and aggregate response counts
     *                             items:
     *                               type: object
     *                               properties:
     *                                 answer:
     *                                   type: string
     *                                   example: True
     *                                 weight:
     *                                   type: number
     *                                   example: 1
     *                                 color:
     *                                   type: string
     *                                   example: '#00ff00'
     *                                 responses:
     *                                   type: integer
     *                                   example: 8
     *                           allowMultipleResponses:
     *                             type: boolean
     *                             example: false
     *                           blind:
     *                             type: boolean
     *                             example: false
     *                           allowTextResponses:
     *                             type: boolean
     *                             example: false
     *                           createdAt:
     *                             type: integer
     *                             description: Poll creation timestamp in milliseconds
     *                             example: 1712428800000
     *       400:
     *         description: Invalid parameters
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ValidationError'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: User is not logged into the selected class or lacks permission
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
     */
    router.get(
        "/class/:id/polls",
        isAuthenticated,
        isOwnerOrHasScopes(membershipService.classroomOwnerCheck, SCOPES.CLASS.POLL.READ, "You do not have permission to view polls for this class."),
        async (req, res) => {
            const classId = req.params.id;
            requireQueryParam(classId, "classId");

            // Ensure the authenticated user is logged into / associated with this class.
            const userClassId = req.user?.classId ?? req.user?.activeClass ?? classStateStore.getUser(req.user?.email)?.activeClass;
            if (!userClassId || String(userClassId) !== String(classId)) {
                return res.status(403).json({
                    success: false,
                    error: "User is not logged into the selected class or lacks permission",
                });
            }

            req.infoEvent("class.polls.view", "Viewing class polls", { classId });

            const { limit, offset } = parsePaginationQuery(req.query, DEFAULT_POLL_LIMIT, MAX_POLL_LIMIT);

            const { polls, total } = await getPreviousPolls(classId, limit, offset);

            req.infoEvent("class.polls.data_sent", "Poll data sent to client", { classId, pollCount: polls.length, limit, offset });

            res.status(200).json({
                success: true,
                data: {
                    polls,
                    pagination: buildPagination(total, limit, offset, polls.length),
                },
            });
        }
    );

	/**
     * @swagger
     * /api/v1/class/{id}/pollhistory:
     *   get:
     *     summary: Get history of polls in a class
     *     tags:
     *       - Class - Polls
     *     description: |
     *       Returns the poll history data for a class, including responses. Results are paginated.
     *
     *       **Required Permission:** `CLASS.SYSTEM.ADMIN`
     *
     *     security:
     *       - bearerAuth: []
     *       - apiKeyAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Class ID
     *       - in: query
     *         name: limit
     *         required: false
     *         schema:
     *           type: integer
     *           default: 20
     *           minimum: 1
     *           maximum: 100
     *         description: Maximum number of polls to return
     *       - in: query
     *         name: offset
     *         required: false
     *         schema:
     *           type: integer
     *           default: 0
     *           minimum: 0
     *         description: Number of polls to skip before returning results
     *     responses:
     *       200:
     *         description: Poll data retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 data:
     *                   type: object
     *                   properties:
     *                     polls:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           pollId:
     *                             type: integer
     *                             description: Class-relative poll ID (increments within a class)
     *                             example: 12
     *                           prompt:
     *                             type: string
     *                             description: Poll prompt shown to students
     *                             example: True/False
     *                           responses:
     *                             type: array
     *                             description: Poll options and aggregate response counts
     *                             items:
     *                               type: object
     *                               properties:
     *                                 answer:
     *                                   type: string
     *                                   example: True
     *                                 weight:
     *                                   type: number
     *                                   example: 1
     *                                 color:
     *                                   type: string
     *                                   example: '#00ff00'
     *                                 responses:
     *                                   type: integer
     *                                   example: 8
     *                           allowMultipleResponses:
     *                             type: boolean
     *                             example: false
     *                           blind:
     *                             type: boolean
     *                             example: false
     *                           allowTextResponses:
     *                             type: boolean
     *                             example: false
     *                           createdAt:
     *                             type: integer
     *                             description: Poll creation timestamp in milliseconds
     *                             example: 1712428800000
     *       400:
     *         description: Invalid parameters
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ValidationError'
     *       401:
     *         description: Not authenticated
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UnauthorizedError'
     *       403:
     *         description: User is not logged into the selected class or lacks permission
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
     */
    router.get(
        "/class/:id/pollhistory",
        isAuthenticated,
        isOwnerOrHasScopes(membershipService.classroomOwnerCheck, SCOPES.CLASS.SYSTEM.ADMIN, "You do not have permission to view polls with user responses for this class."),
        async (req, res) => {
            const classId = req.params.id;
            requireQueryParam(classId, "classId");

            // Ensure the authenticated user is logged into / associated with this class.
            const userClassId = req.user?.classId ?? req.user?.activeClass ?? classStateStore.getUser(req.user?.email)?.activeClass;
            if (!userClassId || String(userClassId) !== String(classId)) {
                return res.status(403).json({
                    success: false,
                    error: "User is not logged into the selected class or lacks permission",
                });
            }

            req.infoEvent("class.polls.view", "Viewing class polls", { classId });

            const { limit, offset } = parsePaginationQuery(req.query, DEFAULT_POLL_LIMIT, MAX_POLL_LIMIT);

            const { polls, total } = await getPreviousPolls(classId, limit, offset, true);

            req.infoEvent("class.polls.data_sent", "Poll data sent to client", { classId, pollCount: polls.length, limit, offset });

            res.status(200).json({
                success: true,
                data: {
                    polls,
                    pagination: buildPagination(total, limit, offset, polls.length),
                },
            });
        }
    );
};
