const { isLoggedIn, permCheck } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        app.get('/selectClass', isLoggedIn, permCheck, (req, res) => {
            try {
                logger.log('info', `[get /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
        
                database.all(
                    'SELECT classroom.name, classroom.key FROM users JOIN classusers ON users.id = classusers.studentId JOIN classroom ON classusers.classId = classroom.id WHERE users.username=?',
                    [req.session.username],
                    (err, joinedClasses) => {
                        try {
                            if (err) throw err
        
                            logger.log('verbose', `[get /selectClass] joinedClasses=(${JSON.stringify(joinedClasses)})`)
                            res.render('pages/selectClass', {
                                title: 'Select Class',
                                joinedClasses: joinedClasses
                            })
                        } catch (err) {
                            logger.log('error', err.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            })
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })
        
        
        //Adds user to a selected class, typically from the select class page
        app.post('/selectClass', isLoggedIn, permCheck, async (req, res) => {
            try {
                let classCode = req.body.key.toLowerCase()
        
                logger.log('info', `[post /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) classCode=(${classCode})`)
        
                let classJoinStatus = await joinClass(req.session.username, classCode)
        
                if (typeof classJoinStatus == 'string') {
                    res.render('pages/message', {
                        message: `Error: ${classJoinStatus}`,
                        title: 'Error'
                    })
                    return
                }
        
                let classData = classInformation[classCode]
        
                let cpPermissions = Math.min(
                    classData.permissions.controlPolls,
                    classData.permissions.manageStudents,
                    classData.permissions.manageClass
                )
        
                advancedEmitToClass('cpUpdate', classCode, { classPermissions: cpPermissions }, classInformation[classCode])
        
                req.session.class = classCode
        
                setClassOfApiSockets(classInformation[classCode].students[req.session.username].API, classCode)
        
                res.redirect('/')
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