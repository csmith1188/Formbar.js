const { dbGet, dbGetAll } = require('../modules/database');
const { logger } = require('../modules/logger');
const { isVerified, permCheck } = require('./middleware/authentication');

module.exports = {
    run(app) {
        // Handle displaying the pools management page
        app.get('/pools', isVerified, permCheck, async (req, res) => {
            try {
                const userId = req.session.userId;

                // Fetch user pool data
                const poolUser = await dbGet("SELECT * FROM digipog_pool_users WHERE id = ?", [userId]);
                if (!poolUser) {
                    return res.render('pages/pools', {
                        title: 'Digipog Pools',
                        pools: [],
                        ownedPools: [],
                        memberPools: [],
                        userId
                    });
                }

                const ownedPools = poolUser.owner ? poolUser.owner.split(',') : [];
                const memberPools = poolUser.member ? poolUser.member.split(',') : [];
                const allPoolIds = [...new Set([...ownedPools, ...memberPools])];

                // Fetch all pools and their members/owners in parallel
                const pools = await Promise.all(allPoolIds.map(async (poolId) => {
                    const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolId]);
                    if (pool) {
                        pool.members = await dbGetAll("SELECT id FROM digipog_pool_users WHERE member LIKE ?", [`%${poolId}%`]);
                        pool.owner = await dbGet("SELECT id FROM digipog_pool_users WHERE owner LIKE ?", [`%${poolId}%`]);
                    }
                    return pool;
                }));


                res.render('pages/pools', {
                    title: 'Digipog Pools',
                    pools: JSON.stringify(pools) || [], // Filter out null values
                    ownedPools: JSON.stringify(ownedPools),
                    memberPools: JSON.stringify(memberPools),
                    userId: userId,
                });

            } catch (err) {
                logger.log('error', `Error fetching pools: ${err.message}`);
                res.render('pages/message', {
                    title: 'Error',
                    message: 'An error occurred while fetching pools. Please try again later.'
                });
            }
        });
    }
};