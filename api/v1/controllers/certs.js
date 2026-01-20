const { logger } = require("@modules/logger");
const { logNumbers } = require("@modules/config");
const fs = require("fs");

module.exports = (router) => {
    try {
        /**
         * @swagger
         * /api/v1/certs:
         *   get:
         *     summary: Get public key certificate
         *     tags:
         *       - Authentication
         *     description: Returns the server's public key in PEM format for JWT verification
         *     responses:
         *       200:
         *         description: Public key retrieved successfully
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 publicKey:
         *                   type: string
         *                   example: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        router.get("/certs", (req, res) => {
            try {
                const pem = fs.readFileSync("publicKey.pem", "utf8");
                res.json({ publicKey: pem });
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });
    } catch (err) {
        logger.log("error", err.stack);
    }
};
