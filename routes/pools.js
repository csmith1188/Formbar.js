const { dbGet, dbGetAll } = require('../modules/database');
const { logger } = require('../modules/logger');
const { isVerified, permCheck } = require('middleware/authentication');

module.exports = {
    run(app) {
        // Handle displaying the pools management page
        app.get('/pools', isVerified, permCheck, async (req, res) => {
            try {
                const id = req.session.user.id;
                const poolUser = await dbGet("SELECT * FROM digipog_pool_users WHERE user_id = ?", [id]);
                const ownedPools = poolUser && poolUser.owner ? poolUser.owner.split(',') : [];
                const memberPools = poolUser && poolUser.member ? poolUser.member.split(',') : [];
                const pools = [];
                for (const poolId of [...ownedPools, ...memberPools]) {
                    const pool = await dbGet("SELECT * FROM digipog_pools WHERE id = ?", [poolId]);
                    pool.members = await dbGetAll("SELECT id FROM digipog_pool_users WHERE member LIKE ?", [`%${poolId}%`]);
                    pool.owner = await dbGet("SELECT id FROM digipog_pool_users WHERE owner LIKE ?", [`%${poolId}%`]);
                    if (pool) pools.push(pool);
                }
                res.render('pages/pools', {
                    title: 'Digipog Pools',
                    pools: pools,
                    ownedPools: ownedPools,
                    memberPools: memberPools,
                    userId: req.session.user.id
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            }
        });
    }
}