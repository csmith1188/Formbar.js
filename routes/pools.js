const { dbGet } = require("../modules/database");
const { logger } = require("../modules/logger");
const { isVerified, permCheck } = require("./middleware/authentication");
const pools = require("../modules/pools");

module.exports = {
    run(app) {
        // Handle displaying the pools management page
        app.get("/pools", isVerified, permCheck, async (req, res) => {
            try {
                const userId = req.session.userId;

                // Get all pools for this user using the new schema helper
                const userPools = await pools.getPoolsForUser(userId);
                const ownedPools = userPools.filter(p => p.owner).map(p => String(p.poolId));
                const memberPools = userPools.filter(p => !p.owner).map(p => String(p.poolId));
                const allPoolIds = [...new Set([...ownedPools, ...memberPools])];

                // Fetch all pool objects and attach members/owners using helper
                const poolObjs = await Promise.all(
                    allPoolIds.map(async (poolIdStr) => {
                        const poolId = parseInt(poolIdStr, 10);
                        if (Number.isNaN(poolId)) return null;
                        const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolId]);
                        if (pool) {
                            const users = await pools.getUsersForPool(poolId);
                            pool.members = users.filter(u => !u.owner).map(u => u.userId);
                            pool.owners = users.filter(u => u.owner).map(u => u.userId);
                        }
                        return pool;
                    })
                );

                res.render("pages/pools", {
                    title: "Digipog Pools",
                    pools: JSON.stringify(poolObjs.filter(p => p)), // Filter out null values
                    ownedPools: JSON.stringify(ownedPools),
                    memberPools: JSON.stringify(memberPools),
                    userId: userId,
                });
            } catch (err) {
                logger.log("error", `Error fetching pools: ${err.message}`);
                res.render("pages/message", {
                    title: "Error",
                    message: "An error occurred while fetching pools. Please try again later.",
                });
            }
        });
    },
};
