const { isAuthenticated, permCheck } = require("../api/v1/controllers/middleware/authentication");
const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");

module.exports = {
    run(app) {
        app.get("/downloadDatabase", isAuthenticated, permCheck, (req, res) => {
            try {
                // Log the request details
                logger.log("info", `[get /downloadDatabase] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                res.download("database/database.db", "database.db");
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });
    },
};
