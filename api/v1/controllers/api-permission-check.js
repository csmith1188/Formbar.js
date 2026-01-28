const { classInformation } = require("@modules/class/classroom");
const { getUser } = require("@modules/user/user");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Used for checking class permissions such as the ability to use games and auxiliary
    router.get("/apiPermissionCheck", async (req, res) => {
        let { api, permissionType, classId } = req.query;

        let permissionTypes = {
            games: null,
            auxiliary: null,
        };

        if (!api) {
            throw new ValidationError("No API provided.");
        }

        if (!permissionType) {
            throw new ValidationError("No permissionType provided.");
        }

        if (!classId) {
            throw new ValidationError("No classId provided.");
        }

        if (!Object.keys(permissionTypes).includes(permissionType)) {
            throw new ValidationError("Invalid permissionType.");
        }

        const user = await getUser({ api });
        if (!user.loggedIn) {
            throw new ForbiddenError("User is not logged in.");
        }

        // Check if there is a class id set for the user
        if (!user.classId) {
            throw new ForbiddenError("User is not in a class.");
        }

        // Check if the user is in the requested class
        if (user.classId != classId) {
            throw new ForbiddenError("User is not in the requested class.");
        }

        const classroom = classInformation.classrooms[user.classId];
        permissionTypes.games = classroom.permissions.games;
        permissionTypes.auxiliary = classroom.permissions.auxiliary;

        if (user.classPermissions < permissionTypes[permissionType]) {
            throw new ForbiddenError("User does not have enough permissions.");
        }

        res.status(200).json({ allowed: true });
    });
};
