const { logger } = require("@modules/logger");
const { pollResponse } = require("@modules/polls");
const { classInformation } = require("@modules/class/classroom");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("pollResp", (res, textRes) => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;
                pollResponse(classId, res, textRes, socket.request.session);
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
    },
};
