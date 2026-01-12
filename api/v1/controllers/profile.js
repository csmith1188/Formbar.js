module.exports = (router) => {

    router.get("/profile/:userId", async (req, res) => {
        try {
            // Log the request information
            logger.log("info", `[get /profile] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
            
        } catch (err) {
            res.status(500).json({ error: `Failed to retrieve profile: ${err.message}` });
        }
    });

}