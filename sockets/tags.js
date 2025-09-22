const { logger } = require("../modules/logger")
const { setTags, saveTags } = require("../modules/class/tags");

module.exports = {
	run(socket, socketUpdates) {
        // Update class tag list
        socket.on('setTags', async (tags) => {
            try {
                await setTags(tags, socket.request.session);
                socketUpdates.classUpdate();
                socket.emit('setTags', 'success');
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('message', 'There was a server error try again.');
            }
        });

        // Save tags for a specific student
        socket.on('saveTags', async (studentId, tags) => {
            try {
                await saveTags(studentId, tags, socket.request.session);
                socketUpdates.classUpdate();
                socket.emit('saveTags', 'success');
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('message', 'There was a server error try again.');
            }
        })
    }
}