const { httpPermCheck } = require("@modules/middleware/permissionCheck");
const { leaveClass } = require("@modules/class/class");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Leaves the current class session
    // The user is still attached to the classroom
    router.post("/class/:id/leave", httpPermCheck("leaveClass"), async (req, res) => {
        const result = leaveClass(socket);
        if (!result) {
            throw new ForbiddenError("Unauthorized");
        }

        res.status(200).json({ message: "Success" });
    });
};
