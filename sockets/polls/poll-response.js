const { pollResponse } = require("@services/poll-service");
const { classInformation } = require("@modules/class/classroom");
const { handleSocketError } = require("@modules/socket-error-handler");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("pollResp", (res, textRes) => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;
                pollResponse(classId, res, textRes, socket.request.session);
            } catch (err) {
                handleSocketError(err, socket, "pollResp");
            }
        });
    },
};
