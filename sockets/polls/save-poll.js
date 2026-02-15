const { classInformation } = require("@modules/class/classroom");
const { database } = require("@modules/database");
const { logger } = require("@modules/logger");
const { userSockets } = require("@modules/socket-updates");

module.exports = {
    run(socket, socketUpdates) {
        socket.on("classPoll", (poll) => {
            try {
                let userId = socket.request.session.userId;
                database.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
                    try {
                        if (err) throw err;

                        nextPollId = nextPollId.nextPollId + 1;

                        database.run(
                            "INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, allowVoteChanges, allowMultipleResponses, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            [
                                userId,
                                poll.name,
                                poll.prompt,
                                JSON.stringify(poll.answers),
                                poll.textRes,
                                poll.blind,
                                poll.allowVoteChanges,
                                poll.allowMultipleResponses,
                                poll.weight,
                                poll.public,
                            ],
                            (err) => {
                                try {
                                    if (err) throw err;

                                    classInformation.classrooms[socket.request.session.classId].students[
                                        socket.request.session.email
                                    ].ownedPolls.push(nextPollId);
                                    socket.emit("message", "Poll saved successfully!");
                                    socketUpdates.customPollUpdate(socket.request.session.email);
                                    socket.emit("classPollSave", nextPollId);
                                } catch (err) {}
                            }
                        );
                    } catch (err) {}
                });
            } catch (err) {}
        });

        socket.on("savePoll", (poll, pollId) => {
            try {
                const userId = socket.request.session.userId;
                if (pollId) {
                    database.get("SELECT * FROM custom_polls WHERE id=?", [pollId], (err, poll) => {
                        try {
                            if (err) throw err;

                            if (userId != poll.owner) {
                                socket.emit("message", "You do not have permission to edit this poll.");
                                return;
                            }

                            database.run(
                                "UPDATE custom_polls SET name=?, prompt=?, answers=?, textRes=?, blind=?, allowVoteChanges=?, allowMultipleResponses=?, weight=?, public=? WHERE id=?",
                                [
                                    poll.name,
                                    poll.prompt,
                                    JSON.stringify(poll.answers),
                                    poll.textRes,
                                    poll.blind,
                                    poll.allowVoteChanges,
                                    poll.allowMultipleResponses,
                                    poll.weight,
                                    poll.public,
                                    pollId,
                                ],
                                (err) => {
                                    try {
                                        if (err) throw err;

                                        socket.emit("message", "Poll saved successfully!");
                                        socketUpdates.customPollUpdate(socket.request.session.email);
                                    } catch (err) {}
                                }
                            );
                        } catch (err) {}
                    });
                } else {
                    database.get('SELECT seq AS nextPollId from sqlite_sequence WHERE name = "custom_polls"', (err, nextPollId) => {
                        try {
                            if (err) throw err;

                            nextPollId = nextPollId.nextPollId + 1;

                            database.run(
                                "INSERT INTO custom_polls (owner, name, prompt, answers, textRes, blind, allowVoteChanges, allowMultipleResponses, weight, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                [
                                    userId,
                                    poll.name,
                                    poll.prompt,
                                    JSON.stringify(poll.answers),
                                    poll.textRes,
                                    poll.blind,
                                    poll.allowVoteChanges,
                                    poll.allowMultipleResponses,
                                    poll.weight,
                                    poll.public,
                                ],
                                (err) => {
                                    try {
                                        if (err) throw err;

                                        classInformation.classrooms[socket.request.session.classId].students[
                                            socket.request.session.email
                                        ].ownedPolls.push(nextPollId);
                                        socket.emit("message", "Poll saved successfully!");
                                        socketUpdates.customPollUpdate(socket.request.session.email);
                                    } catch (err) {}
                                }
                            );
                        } catch (err) {}
                    });
                }
            } catch (err) {}
        });

        socket.on("setPublicPoll", (pollId, value) => {
            try {
                database.run("UPDATE custom_polls set public=? WHERE id=?", [value, pollId], (err) => {
                    try {
                        if (err) throw err;

                        for (const userSocket of Object.values(userSockets)) {
                            socketUpdates.customPollUpdate(userSocket.request.session.email);
                        }
                    } catch (err) {}
                });
            } catch (err) {}
        });
    },
};
