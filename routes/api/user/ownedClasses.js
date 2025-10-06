const { logger } = require("../../../modules/logger")
const { dbGet } = require("../../../modules/database");
const { getUserOwnedClasses} = require("../../../modules/user/user");
const { httpPermCheck } = require("../../middleware/permissionCheck");

module.exports = {
    run(router) {
        // Gets a user's owned classes
        router.get('/user/:id/ownedClasses', httpPermCheck('getOwnedClasses'), async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
                if (!user) {
                    return res.json({ error: "User not found" })
                }

                const ownedClasses = await getUserOwnedClasses(user.email, req.session.user);
                res.status(200).json(ownedClasses);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        })
    }
}