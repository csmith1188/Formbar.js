const { permCheck, isAuthenticated } = require("@modules/middleware/authentication");
const { logger } = require("@modules/logger");
const fs = require("fs");
const { logNumbers } = require("@modules/config");

module.exports = {
    run(app) {
        // Handle displaying all logs to the manager
        app.get("/logs", isAuthenticated, permCheck, (req, res) => {
            try {
                logger.log("info", `[get /logs] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                const logs = fs
                    .readdirSync("./logs")
                    .filter((fileName) => fileName.endsWith(".log"))
                    .filter((fileName) => {
                        try {
                            const stat = fs.statSync(`./logs/${fileName}`);
                            return stat.size > 0; // Exclude empty log files
                        } catch (e) {
                            return false;
                        }
                    });
                res.render("pages/logs", { logs, title: "Logs" });
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });

        // Handle displaying a specific log to the manager
        app.get("/logs/:log", isAuthenticated, permCheck, (req, res) => {
            try {
                logger.log("info", `[get /logs/:log] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                const logFileName = req.params.log;
                if (!fs.existsSync(`./logs/${logFileName}`)) {
                    return res.render("pages/message", {
                        message: `Error: Log file ${logFileName} not found.`,
                        title: "Error",
                    });
                }

                const content = fs.readFileSync(`./logs/${logFileName}`, "utf8");
                res.render("pages/logs", { content: content, title: logFileName });
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
