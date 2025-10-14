// const { isAuthenticated, permCheck, isVerified } = require("../modules/authentication")
const { classInformation } = require("../modules/class/classroom")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        app.get('/test', (req, res) => {
            try {
                logger.log('info', `[get /test] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                let students = classInformation.classrooms[req.session.classId].students
                let keys = Object.keys(students)
                let allStudents = []

                for (let i = 0; i < keys.length; i++) {
                    const val = { name: keys[i], perms: students[keys[i]].permissions, pollRes: { lettRes: students[keys[i]].pollRes.buttonRes, textRes: students[keys[i]].pollRes.textRes }, help: students[keys[i]].help }
                    allStudents.push(val)
                }

                /* Uses EJS to render the template and display the information for the class.
                This includes the class list of students, poll responses, and the class code - Riley R., May 22, 2023
                */
                res.render('pages/controlPanelRedo', {
                    title: 'New Control Panel',
                    pollStatus: classInformation.classrooms[req.session.classId].poll.status,
                    settingsPermissions: classInformation.classrooms[req.session.classId].permissions.manageClass,
                    tagNames: classInformation.classrooms[req.session.classId].tagNames,
                    settings: JSON.stringify(classInformation.classrooms[req.session.classId].settings)
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