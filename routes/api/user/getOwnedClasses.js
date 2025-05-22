const { logger } = require("../../../modules/logger")
const { dbGet } = require("../../../modules/database");
const { getUserOwnedClasses} = require("../../../modules/user");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { createSocketFromHttp } = require("../../../modules/webServer");

module.exports = {
    run(router) {
        // Gets a class by id
        router.get('/user/:id/ownedClasses', httpPermCheck('getOwnedClasses'), async (req, res) => {
            try {
                const userId = req.params.id;
                const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
                if (!user) {
                    return res.json({ error: "User not found" })
                }

                // TODO: Something is broken here
                const socket = createSocketFromHttp(req, res);
                const ownedClasses = await getUserOwnedClasses(user.email, socket);
                console.log(ownedClasses);
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        })
    }
}