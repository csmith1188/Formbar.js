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
            const email = req.user.email;
            const userData = classInformation.users[email];
            const classId = userData && userData.activeClass != null ? userData.activeClass : req.user.classId;
            const classroom = classInformation.classrooms[classId];
            if (!classroom || !classroom.students || !classroom.students[email]) {
                throw new AuthError("You are not currently in a class.");
            }

            // Poll Setup
            let user = {
                name: req.user.email,
                class: classId,
                tags: req.user.tags,
            };
            let answer = req.query.letter;

            logger.log("info", `[get /student] ip=(${req.ip}) user=(${req.user?.email})`);
            logger.log("verbose", `[get /student] question=(${JSON.stringify(req.query.question)}) answer=(${req.query.letter})`);

            if (answer) {
                classInformation.classrooms[classId].students[req.user.email].pollRes.buttonRes = answer;
            }

            // Render the student page with the user's information
            logger.log(
                "verbose",
                `[get /student] user=(${JSON.stringify(user)}) myRes = (classInformation.classrooms[${"classId"}].students[req.user.email].pollRes.buttonRes) myTextRes = (classInformation.classrooms[${"classId"}].students[req.user.email].pollRes.textRes) lesson = (classInformation.classrooms[${"classId"}].lesson)`
            );
            res.status(200).json({
                success: true,
                data: {
                    user: JSON.stringify(user),
                    myRes: classInformation.classrooms[classId].students[req.user.email].pollRes.buttonRes,
                    myTextRes: classInformation.classrooms[classId].students[req.user.email].pollRes.textRes,
                },
            });
        });

        /**
         * @swagger
         * /api/v1/student:
         *   post:
         *     summary: Submit poll response
         *     tags:
         *       - Student
         *     description: Submits a student's poll response for the current question
         *     parameters:
         *       - in: query
         *         name: poll
         *         required: false
         *         description: Poll identifier
         *         schema:
         *           type: string
         *     requestBody:
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               poll:
         *                 type: string
         *                 description: The poll answer
         *               question:
         *                 type: string
         *                 description: Question data
         *     responses:
         *       200:
         *         description: Poll response submitted successfully
         *       500:
         *         description: Server error
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ServerError'
         */
        /*
        This is for when you send poll data via a post command
        It'll save your response to the student object and the database.
        */
        router.post("/student", isAuthenticated, permCheck, (req, res) => {
            logger.log("info", `[post /student] ip=(${req.ip}) user=(${req.user?.email})`);
            logger.log("verbose", `[post /student] poll=(${JSON.stringify(req.query.poll)}) question=(${JSON.stringify(req.body.question)})`);
            const email = req.user.email;
            const userData = classInformation.users[email];
            const classId = userData && userData.activeClass != null ? userData.activeClass : req.user.classId;

            if (req.query.poll) {
                const answer = req.body.poll;
                if (answer) {
                    classInformation.classrooms[classId].students[req.user.email].pollRes.buttonRes = answer;
                }
                res.status(200).end();
            }
        });
    },
};
