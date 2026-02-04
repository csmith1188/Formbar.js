const { classInformation } = require("@modules/class/classroom");
const { dbRun, dbGet } = require("@modules/database");
const { logger } = require("@modules/logger");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("deletePoll", async (pollId) => {
            const { userId } = socket.request.session;
            const ip = socket.handshake.address;

            logger.info(`[deletePoll] ip=(${ip}) pollId=(${pollId}) session=${JSON.stringify(socket.request.session)}`);
            if (!pollId) return socket.emit("message", "No poll is selected.");

            try {
                const poll = await dbGet("SELECT * FROM custom_polls WHERE id=?", pollId);
                if (!poll) return socket.emit("message", "Poll not found.");

                if (+poll.owner !== userId) {
                    logger.info("[deletePoll] not owner");
                    return socket.emit("message", "You do not have permission to delete this poll.");
                }

                await dbRun("BEGIN TRANSACTION");
                try {
                    await Promise.all([
                        dbRun("DELETE FROM custom_polls WHERE id=?", pollId),
                        dbRun("DELETE FROM shared_polls WHERE pollId=?", pollId),
                        dbRun("DELETE FROM class_polls WHERE pollId=?", pollId),
                    ]);
                    await dbRun("COMMIT");
                } catch (err) {
                    await dbRun("ROLLBACK");
                    throw err;
                }

                // Update classrooms
                for (const classroom of Object.values(classInformation.classrooms)) {
                    let updatePolls = false;

                    classroom.sharedPolls = classroom.sharedPolls?.filter((id) => id !== pollId) || [];
                    for (const user of Object.values(classroom.students)) {
                        const before = [...user.sharedPolls, ...user.ownedPolls];
                        user.sharedPolls = user.sharedPolls.filter((id) => id !== pollId);
                        user.ownedPolls = user.ownedPolls.filter((id) => id !== pollId);
                        if (before.length !== user.sharedPolls.length + user.ownedPolls.length) {
                            updatePolls = true;
                            socketUpdates.customPollUpdate(user.email);
                        }
                    }

                    if (updatePolls) logger.info(`[deletePoll] updated polls for classroom`);
                }

                socket.emit("message", "Poll deleted successfully!");
                logger.info("[deletePoll] deleted");
            } catch (err) {
                logger.error(err.stack);
            }
        });
    },
};
