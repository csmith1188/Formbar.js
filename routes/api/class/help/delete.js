const { hasClassPermission } = require("../../../middleware/permissionCheck");
const { CLASS_PERMISSIONS } = require("../../../../modules/permissions");
const { deleteHelpTicket } = require("../../../../modules/class/help");

module.exports = {
    run(router) {
        // Deletes a help ticket in a class by class ID and user ID
        router.get('/class/:id/students/:userId/help/delete', hasClassPermission(CLASS_PERMISSIONS.CONTROL_POLLS), async (req, res) => {
            try {
                const result = await deleteHelpTicket(true, req.params.userId, req.session.user);
                if (result === true) {
                    res.status(200).json({ message: 'Success' });
                } else {
                    res.status(500).json({ error: result });
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.status(500).json({ error: `There was an internal server error. Please try again.` });
            }
        });
    }
}