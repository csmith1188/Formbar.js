const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { CLASS_SOCKET_PERMISSIONS } = require("../modules/permissions")
const { advancedEmitToClass, runningTimers } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('vbTimer', () => {
            let classData = classInformation.classrooms[socket.request.session.classId];
            let username = socket.request.session.username

            advancedEmitToClass('vbTimer', socket.request.session.class, {
                classPermissions: CLASS_SOCKET_PERMISSIONS.vbTimer,
                username
            }, classData.timer);
        })

        socket.on("timer", (startTime, active, sound) => {
            // This handles the server side timer
            try {
                let classData = classInformation[socket.request.session.class];

                startTime = Math.round(startTime * 60)

                classData.timer.startTime = startTime
                classData.timer.timeLeft = startTime + 1
                classData.timer.active = active
                classData.timer.sound = sound

                socketUpdates.classPermissionUpdate()
                if (active) {
                    // Run the function once instantly
                    socketUpdates.timer(sound, active)
                    
                    // Save a clock in the class data, which will saves when the page is refreshed
                    runningTimers[socket.request.session.class] = setInterval(() => socketUpdates.timer(sound, active), 1000);
                } else {
                    // If the timer is not active, clear the interval
                    clearInterval(runningTimers[socket.request.session.class]);
                    runningTimers[socket.request.session.class] = null;

                    socketUpdates.timer(sound, active)
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        })

        socket.on("timerOn", () => {
            socket.emit("timerOn", classInformation[socket.request.session.class].timer.active);
        })
    }
}