const { isAuthenticated, permCheck, isVerified } = require("../api/v1/controllers/middleware/authentication");
const { logNumbers } = require("../modules/config");
const { logger } = require("../modules/logger");

module.exports = {
    run(app) {
        app.get("/links", isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log("info", `[get /links] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                res.render("pages/links.ejs", {
                    title: "Links",
                });
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });

        app.get("/links/getLinkFavicon", async (req, res) => {
            const imageUrl = req.query.url;
            let parsedUrl;
            try {
                parsedUrl = new URL(imageUrl);
            } catch (e) {
                return res.status(400).send("Invalid URL");
            }
            // Allowlist checks
            if (
                parsedUrl.protocol !== "https:" ||
                parsedUrl.hostname !== "www.google.com" ||
                parsedUrl.pathname !== "/s2/favicons" ||
                !parsedUrl.searchParams.has("domain")
            ) {
                return res.status(400).send({ error: "Error fetching image" });
            }

            try {
                const response = await fetch(imageUrl, { redirect: "error" });
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    res.set("Content-Type", response.headers.get("content-type"));
                    res.set("Access-Control-Allow-Origin", "*");
                    res.send(buffer);
                } else {
                }
            } catch (error) {
                res.status(500).send({ error: "Error fetching image" });
            }
        });
    },
};
