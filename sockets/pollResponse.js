const { logger } = require("../modules/logger")
const { pollResponse } = require('../modules/polls');

module.exports = {
    run(socket, socketUpdates) {
        socket.on('pollResp', (res, textRes) => {
            try {
                pollResponse(res, textRes, socket);
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}