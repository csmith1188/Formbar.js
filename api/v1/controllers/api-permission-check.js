const { classInformation } = require("@modules/class/classroom");
const { getUser } = require("@modules/user/user");
const ValidationError = require("@errors/validation-error");
const ForbiddenError = require("@errors/forbidden-error");

module.exports = (router) => {
    // Used for checking class permissions such as the ability to use games and auxiliary
    router.get("/apiPermissionCheck", async (req, res) => {
        let { api, permissionType, classId } = req.query;
        req.infoEvent("api.permission.check.attempt", "Attempting API permission check", { permissionType, classId });

        let permissionTypes = {
            games: null,
            auxiliary: null,
        };

        if (!api) {
            throw new ValidationError("No API provided.", { event: "api.permission.check.failed", reason: "missing_api" });
        }

        if (!permissionType) {
            throw new ValidationError("No permissionType provided.", { event: "api.permission.check.failed", reason: "missing_permission_type" });
        }

        if (!classId) {
            throw new ValidationError("No classId provided.", { event: "api.permission.check.failed", reason: "missing_class_id" });
        }

        if (!Object.keys(permissionTypes).includes(permissionType)) {
            throw new ValidationError("Invalid permissionType.", { event: "api.permission.check.failed", reason: "invalid_permission_type" });
        }

        const user = await getUser({ api });
        if (!user.loggedIn) {
            throw new ForbiddenError("User is not logged in.", { event: "api.permission.check.failed", reason: "not_logged_in" });
        }

        // Check if there is a class id set for the user
        if (!user.classId) {
            throw new ForbiddenError("User is not in a class.", { event: "api.permission.check.failed", reason: "not_in_class" });
        }

        // Check if the user is in the requested class
        if (user.classId != classId) {
            throw new ForbiddenError("User is not in the requested class.", { event: "api.permission.check.failed", reason: "not_in_requested_class" });
        }

        const classroom = classInformation.classrooms[user.classId];
        permissionTypes.games = classroom.permissions.games;
        permissionTypes.auxiliary = classroom.permissions.auxiliary;

        if (user.classPermissions < permissionTypes[permissionType]) {
            throw new ForbiddenError("User does not have enough permissions.", { event: "api.permission.check.failed", reason: "insufficient_permissions" });
        }

        req.infoEvent("api.permission.check.success", "API permission check passed", { permissionType, classId });
        res.status(200).json({ allowed: true });
    });
};
