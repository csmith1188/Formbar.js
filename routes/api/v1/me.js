const { logger } = require("../../../modules/logger");

module.exports = {
    run(router) {
        // Gets the current user's information
        router.get("/me", async (req, res) => {
            try {
                // Log the request details and get the user's session information
                logger.log("info", `[get api/me] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                const user = req.session.user;

                // Send the user's data as a JSON response
                res.status(200).json(user);
            } catch (err) {
                // If an error occurs, log the error and send an error message as a JSON response
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was a server error try again." });
            }
        });
    },
};
