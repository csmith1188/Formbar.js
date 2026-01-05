const { compare } = require("@modules/crypto");
const { dbGet } = require("@modules/database");

module.exports = (router) => {
    router.post("/auth/login", async (req, res) => {
        try {
            const userInformation = {
                email: req.body.email,
                password: req.body.password
            }

            if (!userInformation.email || !userInformation.password) {
                return res.status(400).json({ error: "Email and password are required." });
            }

            const userData = await dbGet("SELECT * FROM users WHERE email = ?", [userInformation.email]);
            const passwordMatches = await compare(password, userData.password);
            if (passwordMatches) {
                console.log('yay time to login')
            } else {
                console.log('nopers')
            }
        } catch (err) {
            logger.log("error", err.stack);
        }
    });
}