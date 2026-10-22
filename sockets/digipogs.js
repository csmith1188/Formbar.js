const { awardDigipogs, transferDigipogs } = require("@services/digipog-service");
const { SCOPES } = require("@modules/permissions");
const { onSocketEvent, hasScope, hasClassScope } = require("@modules/socket-event-middleware");

module.exports = {
    run(socket) {
        // For those with teacher permissions or higher to add digipogs to a user's account
        onSocketEvent(socket, "awardDigipogs", hasClassScope(SCOPES.CLASS.DIGIPOGS.AWARD), async (socketContext, awardData) => {
            const result = await awardDigipogs(awardData, socketContext.session);
            socket.emit("awardDigipogsResponse", result);
        });

        // For transferring digipogs between users for third party services
        onSocketEvent(socket, "transferDigipogs", hasScope(SCOPES.GLOBAL.DIGIPOGS.TRANSFER), async (socketContext, transferData) => {
            transferData.userId = socketContext.session.id;
            const result = await transferDigipogs(transferData);
            socket.emit("transferResponse", result);
        });
    },
};
