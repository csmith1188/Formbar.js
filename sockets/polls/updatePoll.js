const { logger } = require("../../modules/logger")
const { classInformation } = require("../../modules/class/classroom");
const { savePollToHistory } = require("../../modules/polls");

module.exports = {
    run(socket, socketUpdates) {
        socket.on('updatePoll', (options) => {
            try {

            } catch (err) {
                logger.log('error', err.stack);
            }
        });
    }
}