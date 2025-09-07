const { classInformation } = require("../../../modules/class/classroom")
const { logger } = require("../../../modules/logger")
const { dbGet } = require("../../../modules/database");
const {MANAGER_PERMISSIONS} = require("../../../modules/permissions");

module.exports = {
    run(router) {
        // Gets a class by id
        router.get('/user/:id', async (req, res) => {
            try {
                const userId = req.params.id;

                // Check if the user is already logged in, and if they're not
                // then load them from the database.
                let user = Object.values(classInformation.users).find(user => user.id == userId);
                if (!user) {
                    user = await dbGet('SELECT * FROM users WHERE id=?', userId);
                }

                // Only include the email if the requester is the user themselves or a manager
                const requesterEmail = req.session.email;
                let userEmail = undefined;
                if (requesterEmail === user.email || classInformation.users[requesterEmail].permissions === MANAGER_PERMISSIONS) {
                    userEmail = user.email
                }

                if (user) {
                    res.status(200).json({
                        id: user.id,
                        email: userEmail,
                        permissions: user.permissions,
                        digipogs: user.digipogs,
                        displayName: user.displayName,
                        verified: user.verified
                    });
                } else {
                    return res.status(404).json({ error: "User not found" });
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).send(`Error: ${err.message}`);
            }
        })
    }
}