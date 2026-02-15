const { classInformation } = require("@modules/class/classroom");
const { CLASS_SOCKET_PERMISSIONS } = require("@modules/permissions");
const { advancedEmitToClass, runningTimers } = require("@modules/socket-updates");
const { handleSocketError } = require("@modules/socket-error-handler");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("vbTimer", () => {
            try {
                let classData = classInformation.classrooms[socket.request.session.classId];
                let email = socket.request.session.email;

                advancedEmitToClass(
                    "vbTimer",
                    socket.request.session.classId,
                    {
                        classPermissions: CLASS_SOCKET_PERMISSIONS.vbTimer,
                        email,
                    },
                    classData.timer
                );
            } catch (err) {
                handleSocketError(err, socket, "vbTimer");
            }
        });

        // This handles the server side timer
        socket.on("timer", (startTime, active, sound) => {
            try {
                let classData = classInformation.classrooms[socket.request.session.classId];
                startTime = Math.round(startTime);

                classData.timer.startTime = startTime;
                classData.timer.timeLeft = startTime;
                classData.timer.active = active;
                classData.timer.sound = sound;
                socketUpdates.classUpdate();

                if (active) {
                    // Run the function once instantly
                    socketUpdates.timer(sound, active);

                    // Save a clock in the class data, which will saves when the page is refreshed
                    runningTimers[socket.request.session.classId] = setInterval(() => socketUpdates.timer(sound, active), 1000);
                } else {
                    // If the timer is not active, clear the interval
                    clearInterval(runningTimers[socket.request.session.classId]);
                    runningTimers[socket.request.session.classId] = null;

                    socketUpdates.timer(sound, active);
                }
            } catch (err) {
                handleSocketError(err, socket, "timer");
            }
        });

        socket.on("timerOn", () => {
            try {
                socket.emit("timerOn", classInformation.classrooms[socket.request.session.classId].timer.active);
            } catch (err) {
                handleSocketError(err, socket, "timerOn");
            }
        });
    },
};
