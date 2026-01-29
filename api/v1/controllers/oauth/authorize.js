const { logger } = require("@modules/logger");
const { classInformation } = require("@modules/class/classroom");
const { Student } = require("@modules/student");
const authService = require("@services/auth-service");
const ValidationError = require("@errors/validation-error");
const { requireQueryParam } = require("@modules/error-wrapper");

module.exports = (router) => {
    router.get("/oauth/authorize", async (req, res) => {
        const { response_type, client_id, redirect_uri, scope, state } = req.query;

        // If response_type is provided, validate it
        // If not, we can assume default behavior
        if (response_type && response_type !== "code") {
            throw new ValidationError("Unsupported response_type. Only 'code' is supported.");
        }

        // Validate required parameters
        requireQueryParam(client_id, "client_id");
        requireQueryParam(redirect_uri, "redirect_uri");
        requireQueryParam(scope, "scope");
        requireQueryParam(state, "state");

        // Log the authorization request
        logger.log("info", `[get /oauth/authorize] ip=(${req.ip}) client_id=(${client_id}) redirect_uri=(${redirect_uri}) scope=(${scope}) state=(${state})`);


    });
};
