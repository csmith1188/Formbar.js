const { isAuthenticated, permCheck } = require("@modules/middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { logger } = require("@modules/logger");
const AuthError = require("@errors/auth-error");

module.exports = {
    run(router) {
        /* 
        Student page, the layout is controlled by different "modes" to display different information.
        There is currently 1 working mode:
            Poll: For displaying a multiple choice or essay question
        */
        router.get("/student", isAuthenticated, permCheck, (req, res) => {
            // If the student is not currently in a class, redirect them back to the home page
            const email = req.session.email;
            const userData = classInformation.users[email];
            const classId = userData && userData.activeClass != null ? userData.activeClass : req.session.classId;
            const classroom = classInformation.classrooms[classId];
            if (!classroom || !classroom.students || !classroom.students[email]) {
                throw new AuthError("You are not currently in a class.");
            }

            // Poll Setup
            let user = {
                name: req.session.email,
                class: classId,
                tags: req.session.tags,
            };
            let answer = req.query.letter;

            if (answer) {
                classInformation.classrooms[classId].students[req.session.email].pollRes.buttonRes = answer;
            }

            // Render the student page with the user's information
            res.status(200).json({
                user: JSON.stringify(user),
                myRes: classInformation.classrooms[classId].students[req.session.email].pollRes.buttonRes,
                myTextRes: classInformation.classrooms[classId].students[req.session.email].pollRes.textRes,
            });
        });

        /* 
        This is for when you send poll data via a post command
        It'll save your response to the student object and the database.
        */
        router.post("/student", isAuthenticated, permCheck, (req, res) => {
            const email = req.session.email;
            const userData = classInformation.users[email];
            const classId = userData && userData.activeClass != null ? userData.activeClass : req.session.classId;

            if (req.query.poll) {
                const answer = req.body.poll;
                if (answer) {
                    classInformation.classrooms[classId].students[req.session.email].pollRes.buttonRes = answer;
                }
                res.status(200).end();
            }
        });
    },
};
