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
        req.infoEvent("certs.view.attempt", "Attempting to read public certificate");
        const pem = fs.readFileSync("public-key.pem", "utf8");
        req.infoEvent("certs.view.success", "Public certificate returned");
        res.json({
            success: true,
            data: {
                publicKey: pem,
            },
        });
    });
};
