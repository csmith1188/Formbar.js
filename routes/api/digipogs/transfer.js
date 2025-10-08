const { logger } = require("../../../modules/logger");
const { httpPermCheck } = require("../../middleware/permissionCheck");
const { transferDigipogs } = require("../../../modules/digipogs");

module.exports = {
    run(router) {
        // Transfers digipogs from one user to another
        router.post('/digipogs/transfer', httpPermCheck("transfer"), async (req, res) => {
            try {
                const result = await transferDigipogs(req.body);
                if (result.success) {
                    res.status(200).json(result);
                } else {
                    res.status(400).json(result);
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}