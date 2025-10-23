const { classInformation } = require("../../modules/class/classroom");
const { logger } = require("../../modules/logger");
const { createPoll } = require("../../modules/polls");

module.exports = {
    run(socket, socketUpdates) {
        // Starts a poll with the data provided
        socket.on("startPoll", async (...args) => {
            try {
                const email = socket.request.session.email;
                const classId = classInformation.users[email].activeClass;

                // Support both passing a single object or multiple arguments for backward compatibility
                let pollData;
                if (args.length == 1) {
                    pollData = args[0];
                } else {
                    const [
                        responseNumber,
                        responseTextBox,
                        pollPrompt,
                        polls,
                        blind,
                        weight,
                        tags,
                        boxes,
                        indeterminate,
                        lastResponse,
                        multiRes,
                        allowVoteChanges,
                    ] = args;
                    pollData = {
                        prompt: pollPrompt,
                        answers: Array.isArray(polls) ? polls : [],
                        blind: !!blind,
                        allowVoteChanges: !!allowVoteChanges,
                        weight: Number(weight ?? 1),
                        tags: Array.isArray(tags) ? tags : [],
                        indeterminate: Array.isArray(indeterminate) ? indeterminate : [],
                        allowTextResponses: !!responseTextBox,
                        allowMultipleResponses: !!multiRes,
                    };
                }

                await createPoll(
                    classId,
                    {
                        prompt: pollData.prompt,
                        answers: Array.isArray(pollData.answers) ? pollData.answers : [],
                        blind: !!pollData.blind,
                        allowVoteChanges: !!pollData.allowVoteChanges,
                        weight: Number(pollData.weight ?? 1),
                        tags: Array.isArray(pollData.tags) ? pollData.tags : [],
                        studentsAllowedToVote: Array.isArray(pollData.studentsAllowedToVote) ? pollData.studentsAllowedToVote : [],
                        indeterminate: Array.isArray(pollData.indeterminate) ? pollData.indeterminate : [],
                        allowTextResponses: !!pollData.allowTextResponses,
                        allowMultipleResponses: !!pollData.allowMultipleResponses,
                    },
                    socket.request.session
                );
                socket.emit("startPoll");
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
    },
};
