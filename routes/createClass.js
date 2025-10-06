const { permCheck, isAuthenticated} = require("./middleware/authentication")
const { classInformation, Classroom } = require("../modules/class/classroom")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { DEFAULT_CLASS_PERMISSIONS, MANAGER_PERMISSIONS, TEACHER_PERMISSIONS} = require("../modules/permissions")
const { setClassOfApiSockets, userSockets, emitToUser} = require("../modules/socketUpdates")
const { getStudentsInClass } = require("../modules/student")
const { generateKey } = require("../modules/util")

module.exports = {
    run(app) {
        // Allow teacher to create class
        // Allowing the teacher to create classes is vital to whether the lesson actually works or not, because they have to be allowed to create a teacher class
        // This will allow the teacher to give students student perms, and guests student perms as well
        // Plus they can ban and kick as long as they can create classes
        app.post('/createClass', isAuthenticated, permCheck, (req, res) => {
            try {
                let submittionType = req.body.submittionType
                let className = req.body.name
                let classId = req.body.id

                logger.log('info', `[post /createClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[post /createClass] submittionType=(${submittionType}) className=(${className}) classId=(${classId})`)

                async function makeClass(id, className, key, owner, permissions, sharedPolls = [], pollHistory = [], tags) {
                    try {
                        // Get the teachers session data ready to transport into new class
                        const user = classInformation.users[req.session.email]
                        logger.log('verbose', `[makeClass] id=(${id}) name=(${className}) key=(${key}) sharedPolls=(${JSON.stringify(sharedPolls)})`)

                        if (Object.keys(permissions).sort().toString() != Object.keys(DEFAULT_CLASS_PERMISSIONS).sort().toString()) {
                            for (let permission of Object.keys(permissions)) {
                                if (!DEFAULT_CLASS_PERMISSIONS[permission]) {
                                    delete permissions[permission]
                                }
                            }

                            for (let permission of Object.keys(DEFAULT_CLASS_PERMISSIONS)) {
                                if (!permissions[permission]) {
                                    permissions[permission] = DEFAULT_CLASS_PERMISSIONS[permission]
                                }
                            }

                            database.run('UPDATE classroom SET permissions=? WHERE key=?', [JSON.stringify(permissions), key], (err) => {
                                if (err) logger.log('error', err.stack)
                            })
                        }

                        // Create classroom
                        if (!classInformation.classrooms[id]) {
                            classInformation.classrooms[id] = new Classroom(id, className, key, owner, permissions, sharedPolls, pollHistory, tags)
                        } else {
                            classInformation.classrooms[id].permissions = permissions
                            classInformation.classrooms[id].sharedPolls = sharedPolls
                            classInformation.classrooms[id].pollHistory = pollHistory
                            classInformation.classrooms[id].tags = tags
                            // classInformation.classrooms[id].owner =
                        }

                        // Add the teacher to the newly created class
                        classInformation.classrooms[id].students[req.session.email] = user
                        classInformation.classrooms[id].students[req.session.email].classPermissions = MANAGER_PERMISSIONS
                        classInformation.users[req.session.email].activeClass = id
                        classInformation.users[req.session.email].classPermissions = MANAGER_PERMISSIONS

                        const classStudents = await getStudentsInClass(id);
                        for (const email in classStudents) {
                            // If the student is the teacher or already in the class, skip
                            if (email == req.session.email) continue;
                            if (classInformation.classrooms[id].students[email]) continue;

                            const student = classStudents[email];

                            // Normalize student.tags to an array of strings
                            if (!Array.isArray(student.tags)) {
                                if (typeof student.tags === 'string' && student.tags.trim() !== '') {
                                    student.tags = student.tags.split(',').map(t => t.trim()).filter(Boolean);
                                } else {
                                    student.tags = [];
                                }
                            }

                            // Ensure 'Offline' is present exactly once at the front
                            if (!student.tags.includes('Offline')) {
                                student.tags.unshift('Offline');
                            }

                            student.displayName = student.displayName || student.email;
                            classInformation.users[email] = student;
                            classInformation.classrooms[id].students[email] = student;
                        }

                        // Add class into the session data
                        req.session.classId = id

                        await setClassOfApiSockets(user.API, id)
                        return true
                    } catch (err) {
                        return err
                    }
                }

                // Checks if teacher is creating a new class or joining an old class
                // Generates a 4 character key
                // This is used for students who want to enter a class
                if (submittionType == 'create') {
                    const key = generateKey(4);

                    // Add classroom to the database
                    database.run('INSERT INTO classroom(name, owner, key, permissions, tags) VALUES(?, ?, ?, ?, ?)', [className, req.session.userId, key, JSON.stringify(DEFAULT_CLASS_PERMISSIONS), null], (err) => {
                        try {
                            if (err) throw err

                            logger.log('verbose', '[post /createClass] Added classroom to database')

                            database.get('SELECT id, name, key, permissions, tags FROM classroom WHERE name = ? AND owner = ?', [className, req.session.userId], async (err, classroom) => {
                                try {
                                    if (err) throw err

                                    if (!classroom.id) {
                                        logger.log('critical', 'Class does not exist')
                                        res.render('pages/message', {
                                            message: 'Class does not exist (Please contact the programmer)',
                                            title: 'Login'
                                        })
                                        return
                                    }

                                    let makeClassStatus = await makeClass(
                                        classroom.id,
                                        classroom.name,
                                        classroom.key,
                                        req.session.userId,
                                        JSON.parse(classroom.permissions),
                                        [],
                                        [],
                                        classroom.tags
                                    );

                                    if (makeClassStatus instanceof Error) throw makeClassStatus
                                    if (classInformation.users[req.session.email].permissions >= TEACHER_PERMISSIONS) {
                                        if (userSockets[req.session.email] && Object.keys(userSockets[req.session.email]).length > 0) {
                                            emitToUser(req.session.email, 'reload', '/controlPanel');
                                            return;
                                        }
                                        res.redirect('/controlPanel')
                                    }
                                } catch (err) {
                                    logger.log('error', err.stack);
                                    res.render('pages/message', {
                                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                        title: 'Error'
                                    })
                                }
                            })
                        } catch (err) {
                            logger.log('error', err.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            })
                        }
                    })
                } else {
                    database.get("SELECT classroom.id, classroom.name, classroom.key, classroom.permissions, classroom.tags, classroom.plugins, (CASE WHEN class_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT class_polls.pollId) END) as sharedPolls, (SELECT json_group_array(json_object('id', poll_history.id, 'class', poll_history.class, 'data', poll_history.data, 'date', poll_history.date)) FROM poll_history WHERE poll_history.class = classroom.id ORDER BY poll_history.date) as pollHistory FROM classroom LEFT JOIN class_polls ON class_polls.classId = classroom.id WHERE classroom.id = ?", [classId], async (err, classroom) => {
                        try {
                            if (err) throw err

                            if (!classroom) {
                                logger.log('critical', 'Class does not exist')
                                res.render('pages/message', {
                                    message: 'Class does not exist (Please contact support)',
                                    title: 'Login'
                                })
                                return
                            }

                            classroom.permissions = JSON.parse(classroom.permissions)
                            classroom.sharedPolls = JSON.parse(classroom.sharedPolls)
                            classroom.pollHistory = JSON.parse(classroom.pollHistory)

                            if (classroom.tags) {
                                classroom.tags = classroom.tags.split(",");
                            } else {
                                classroom.tags = [];
                            }

                            for (let poll of classroom.pollHistory) {
                                poll.data = JSON.parse(poll.data)
                            }

                            if (classroom.pollHistory[0] && classroom.pollHistory[0].id == null) {
                                classroom.pollHistory = null
                            }

                            let makeClassStatus = await makeClass(
                                classroom.id,
                                classroom.name,
                                classroom.key,
                                classroom.owner,
                                classroom.permissions,
                                classroom.sharedPolls,
                                classroom.pollHistory,
                                classroom.tags,
                            )

                            if (makeClassStatus instanceof Error)  {
                                throw makeClassStatus
                            }

                            if (classInformation.users[req.session.email].permissions >= TEACHER_PERMISSIONS) {
                                if (userSockets[req.session.email] && Object.keys(userSockets[req.session.email]).length > 0) {
                                    emitToUser(req.session.email, 'reload', '/controlPanel');
                                    return;
                                }
                                res.redirect('/controlPanel')
                            }
                        } catch (err) {
                            logger.log('error', err.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            })
                        }
                    })
                }
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