const fs = require("fs");

module.exports = (router) => {
    /**
     * @swagger
     * /api/v1/certs:
     *   get:
     *     summary: Get public key certificate
     *     tags:
     *       - System
     *     description: |
     *       Returns the public key certificate in PEM format.
     *
     *       **Required Permission:** None (public endpoint)
     *     responses:
     *       200:
     *         description: Public key returned successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 publicKey:
     *                   type: string
     *                   description: PEM formatted public key
     */
    router.get("/certs", (req, res) => {
        const pem = fs.readFileSync("publicKey.pem", "utf8");
        res.json({ publicKey: pem });
    });
};
