const { dbGet } = require("@modules/database");
const { getUserOwnedClasses } = require("@modules/user/user");
const { httpPermCheck } = require("@middleware/permissionCheck");
const NotFoundError = require("@errors/not-found-error");

module.exports = (router) => {
    // Gets a user's owned classes
    router.get("/user/:id/ownedClasses", httpPermCheck("getOwnedClasses"), async (req, res) => {
        const userId = req.params.id;
        const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const ownedClasses = await getUserOwnedClasses(user.email, req.session.user);
        res.status(200).json(ownedClasses);
    });
};
