const fs = require("fs");

module.exports = (router) => {
    router.get("/certs", (req, res) => {
        const pem = fs.readFileSync("publicKey.pem", "utf8");
        res.json({ publicKey: pem });
    });
};
