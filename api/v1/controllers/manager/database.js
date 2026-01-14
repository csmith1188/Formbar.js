const { isAuthenticated, permCheck } = require("../middleware/authentication");
const { logger } = require("@modules/logger");

module.exports = (router) => {
    router.get("/manager/database/export", isAuthenticated, permCheck, (req, res) => {
        try {
            // Log the request details
            logger.log("info", `[get /manager/database/export] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            res.download("database/database.db", "database.db");
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
