const { dbGetAll } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        try {
            // Retrieves 20 previous polls from the database at a time
            // The index is the start of the next 20 polls to retrieve
            socket.on('getPreviousPolls', async (index) => {
                const classId = socket.request.session.classId;
                const previousPolls = await dbGetAll(
                    'SELECT * FROM poll_history WHERE class = ? ORDER BY id DESC LIMIT ?, 20',
                    [classId, index]
                );

                socket.emit('getPreviousPolls', previousPolls);
            });
        } catch (err) {
            logger.log('error', err.stack)
        }
    }
}