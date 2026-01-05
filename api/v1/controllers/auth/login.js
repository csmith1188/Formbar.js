const { compare } = require("@modules/crypto");
const { dbGet } = require("@modules/database");
const { logger } = require("../../../../modules/logger");
const jwt = require("jsonwebtoken");

module.exports = (router) => {
    router.post("/auth/login", async (req, res) => {
        try {
            if (!process.env.SECRET) {
                logger.log("error", "JWT secret is not defined in environment variables.");
                return res.status(500).json({ error: "Server configuration error." });
            }

            const userInformation = {
                email: req.body.email,
                password: req.body.password,
            };

            if (!userInformation.email || !userInformation.password) {
                return res.status(400).json({ error: "Email and password are required." });
            }

            const userData = await dbGet("SELECT * FROM users WHERE email = ?", [userInformation.email]);
            if (!userData) {
                return res.status(401).json({ error: "Incorrect email or password." });
            }

            const passwordMatches = await compare(userInformation.password, userData.password);
            if (passwordMatches) {
                const accessToken = jwt.sign(
                    {
                        id: userData.id,
                        email: userData.email,
                        displayName: userData.displayName,
                    },
                    process.env.SECRET,
                    { expiresIn: "1h" }
                );

                return res.status(200).json({ token: accessToken });
            } else {
                res.status(401).json({ error: "Incorrect email or password." });
            }
        } catch (err) {
            logger.log("error", err.stack);
            res.status(500).json({ error: "There was a server error. Please try again." });
        }
    });
};
