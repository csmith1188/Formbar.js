const { logger } = require("../../modules/logger")
const { classInformation } = require("../../modules/class/classroom");
const { savePollToHistory } = require("../../modules/polls");

module.exports = {
    run(socket, socketUpdates) {
        socket.on('updatePoll', (options) => {
            try {
                // If no classId or options are provided, then return
                const classId = socket.request.session.classId;
                if (!classId || !options) return;

                // If the classroom is not found, then return
                const classroom = classInformation.classrooms[classId];
                if (!classroom) return;

                // For each option, update the poll options if it exists in the poll object
                for (const option of Object.keys(options)) {
                    const value = options[option];
                    if (option === 'status' && value === false) {
                        savePollToHistory(classId);
                    }

                    if (classroom.poll[option]) {
                        classroom.poll[option] = value;
                    }
                }

                socketUpdates.classUpdate();
            } catch (err) {
                logger.log('error', err.stack);
            }
        });
    }
}