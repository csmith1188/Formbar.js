const { dbGet } = require("../../../../modules/database");
const { logger } = require("../../../../modules/logger");
const { isVerified, permCheck } = require("../middleware/authentication");
const pools = require("../../../../modules/pools");

module.exports = {
    run(router) {
        /**
         * @swagger
         * /api/v1/pools:
         *   get:
         *     summary: Get user's digipog pools
         *     tags:
         *       - Pools
         *     description: Returns all digipog pools that the user owns or is a member of
         *     responses:
         *       200:
         *         description: Pools retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 pools:
         *                   type: string
         *                   description: JSON stringified array of pool objects
         *                 ownedPools:
         *                   type: string
         *                   description: JSON stringified array of owned pool IDs
         *                 memberPools:
         *                   type: string
         *                   description: JSON stringified array of member pool IDs
         *                 userId:
         *                   type: string
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        // Handle displaying the pools management page
        router.get("/pools", isVerified, permCheck, async (req, res) => {
            try {
                const userId = req.session.userId;

                // Get all pools for this user using the new schema helper
                const userPools = await pools.getPoolsForUser(userId);

                const ownedPools = userPools.filter((p) => p.owner).map((p) => String(p.pool_id));
                const memberPools = userPools.filter((p) => !p.owner).map((p) => String(p.pool_id));
                const poolObjs = await Promise.all(
                    userPools.map(async (p) => {
                        const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [p.pool_id]);
                        if (pool) {
                            const users = await pools.getUsersForPool(p.pool_id);
                            // Fix: use user_id instead of userId (correct property name from database)
                            pool.members = users.filter((u) => !u.owner).map((u) => u.user_id);
                            pool.owners = users.filter((u) => u.owner).map((u) => u.user_id);
                        }
                        return pool;
                    })
                );

                res.status(200).json({
                    pools: JSON.stringify(poolObjs.filter((p) => p)), // Filter out null values
                    ownedPools: JSON.stringify(ownedPools),
                    memberPools: JSON.stringify(memberPools),
                    userId: userId,
                });
            } catch (err) {
                logger.log("error", `Error fetching pools: ${err.message}`);
                res.status(500).json({ error: "An error occurred while fetching pools. Please try again later." });
            }
        });
    },
};
