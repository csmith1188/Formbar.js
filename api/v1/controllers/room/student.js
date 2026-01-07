const { isAuthenticated, permCheck } = require("../middleware/authentication");
const { classInformation } = require("../../../../modules/class/classroom");
const { logNumbers } = require("../../../../modules/config");
const { logger } = require("../../../../modules/logger");

module.exports = {
    run(router) {
        /* 
        Student page, the layout is controlled by different "modes" to display different information.
        There is currently 1 working mode:
            Poll: For displaying a multiple choice or essay question
        */
        router.get("/student", isAuthenticated, permCheck, (req, res) => {
            try {
                // If the student is not currently in a class, redirect them back to the home page
                const email = req.session.email;
                const userData = classInformation.users[email];
                const classId = userData && userData.activeClass != null ? userData.activeClass : req.session.classId;
                const classroom = classInformation.classrooms[classId];
                if (!classroom || !classroom.students || !classroom.students[email]) {
                    res.status(401).json({error: `You are not currently in a class.`});
                    return;
                }

                // Poll Setup
                let user = {
                    name: req.session.email,
                    class: classId,
                    tags: req.session.tags,
                };
                let answer = req.query.letter;

                logger.log("info", `[get /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log("verbose", `[get /student] question=(${JSON.stringify(req.query.question)}) answer=(${req.query.letter})`);

                if (answer) {
                    classInformation.classrooms[classId].students[req.session.email].pollRes.buttonRes = answer;
                }

                // Render the student page with the user's information
                logger.log(
                    "verbose",
                    `[get /student] user=(${JSON.stringify(user)}) myRes = (classInformation.classrooms[${"classId"}].students[req.session.email].pollRes.buttonRes) myTextRes = (classInformation.classrooms[${"classId"}].students[req.session.email].pollRes.textRes) lesson = (classInformation.classrooms[${"classId"}].lesson)`
                );
                res.status(200).json({
                    user: JSON.stringify(user),
                    myRes: classInformation.classrooms[classId].students[req.session.email].pollRes.buttonRes,
                    myTextRes: classInformation.classrooms[classId].students[req.session.email].pollRes.textRes,
                });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({error: `Error Number ${logNumbers.error}: There was a server error try again.`});
            }
        });

        /* 
        This is for when you send poll data via a post command
        It'll save your response to the student object and the database.
        */
        router.post("/student", isAuthenticated, permCheck, (req, res) => {
            try {
                logger.log("info", `[post /student] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log("verbose", `[post /student] poll=(${JSON.stringify(req.query.poll)}) question=(${JSON.stringify(req.body.question)})`);
                const email = req.session.email;
                const userData = classInformation.users[email];
                const classId = userData && userData.activeClass != null ? userData.activeClass : req.session.classId;

                if (req.query.poll) {
                    const answer = req.body.poll;
                    if (answer) {
                        classInformation.classrooms[classId].students[req.session.email].pollRes.buttonRes = answer;
                    }
                    res.status(200)
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({error: `Error Number ${logNumbers.error}: There was a server error try again.`});
            }
        });
    },
};
