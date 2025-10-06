const { isAuthenticated, permCheck, isVerified } = require("./middleware/authentication")
const { classInformation } = require("../modules/class/classroom")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        // An endpoint for the teacher to control the formbar
        // Used to update students permissions, handle polls and their corresponsing responses
        // On render it will send all students in that class to the page
        app.get('/controlPanel', isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log('info', `[get /controlPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                
                const email = req.session.email;
                const user = classInformation.users[email];
                const classId = user && user.activeClass != null ? user.activeClass : req.session.classId;
                const classroom = classInformation.classrooms[classId];
                if (!classroom) {
                    return res.redirect('/manageClass');
                }

                /* 
                Uses EJS to render the template and display the information for the class.
                This includes class settings, poll status, and tags - Riley R., May 22, 2023
                */
                res.render('pages/controlPanel', {
                    title: 'Control Panel',
                    pollStatus: classroom.poll.status,
                    settingsPermissions: classroom.permissions.manageClass,
                    tags: JSON.stringify(classroom.tags || []),
                    settings: JSON.stringify(classroom.settings)
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })
    }
}