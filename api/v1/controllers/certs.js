const { logger } = require("@modules/logger");
const { logNumbers } = require("@modules/config");
const fs = require("fs");
const AppError = require("@errors/app-error");

module.exports = (router) => {
    router.get("/certs", (req, res) => {
        const pem = fs.readFileSync("publicKey.pem", "utf8");
        res.json({ publicKey: pem });
    });
};
