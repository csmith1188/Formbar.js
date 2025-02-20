const { isLoggedIn, permCheck } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { joinClass } = require("../modules/joinClass")
const { logger } = require("../modules/logger")
const { setClassOfApiSockets, advancedEmitToClass } = require("../modules/socketUpdates")

module.exports = {
    run(app) {
        app.get('/selectClass', isLoggedIn, permCheck, (req, res) => {
            try {
                logger.log('info', `[get /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
        
                database.all(
                    'SELECT classroom.name, classroom.id FROM users JOIN classusers ON users.id = classusers.studentId JOIN classroom ON classusers.classId = classroom.id WHERE users.username=?',
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
        
        // Adds user to a selected class, typically from the select class page
        app.post('/selectClass', isLoggedIn, permCheck, async (req, res) => {
            try {
                let classId = req.body.id;
				let classCode = req.body.key;

				if (!classCode) {
					// Check if the user is in the class with the class id provided
					const userInClass = await new Promise((resolve, reject) => {
						database.get('SELECT * FROM users JOIN classusers ON users.id = classusers.studentId WHERE users.username=? AND classusers.classId=?', [req.session.username, classId], (err, user) => {
							try {
								if (err) {
									reject(err)
									return
								}

								if (!user) {
									resolve(false)
									return
								}

								resolve(true)
							} catch (err) {
								reject(err)
							}
						})
					});

					// Refuse access if the user is not in the class
					if (!userInClass) {
						res.render('pages/message', {
							message: `Error: You are not in that class.`,
							title: 'Error'
						});
						return;
					}

					// Retrieve the class code associated with the class id if the access code is not provided
					classCode = await new Promise((resolve, reject) => {
						database.get('SELECT key FROM classroom WHERE id=?', [classId], (err, classroom) => {
							try {
								if (err) {
									reject(err);
									return;
								}
	
								if (!classroom) {
									resolve(null);
									return;
								}
	
								resolve(classroom.key);
							} catch (err) {
								reject(err);
							}
						}
					)});
				}

                logger.log('info', `[post /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) classCode=(${classId})`)        
                let classJoinStatus = await joinClass(classCode, req.session)

                if (typeof classJoinStatus == 'string') {
                    res.render('pages/message', {
                        message: `Error: ${classJoinStatus}`,
                        title: 'Error'
                    })
                    return
                }

				// If class code is provided, get classId
				if (classCode) {
					classCode = classCode.toLowerCase();

					classId = await new Promise((resolve, reject) => {
						database.get('SELECT id FROM classroom WHERE key=?', [classCode], (err, classroom) => {
							try {
								if (err) {
									reject(err);
									return;
								}
	
								if (!classroom) {
									resolve(null);
									return;
								}
	
								resolve(classroom.id);
							} catch (err) {
								reject(err);
							}
						}
					)});
					req.session.classId = classId;
				}

                let classData = classInformation.classrooms[classId]
                let cpPermissions = Math.min(
                    classData.permissions.controlPolls,
                    classData.permissions.manageStudents,
                    classData.permissions.manageClass
                )

                advancedEmitToClass('cpUpdate', classId, { classPermissions: cpPermissions }, classInformation.classrooms[classId])
				req.session.classId = classId
                setClassOfApiSockets(classInformation.classrooms[classId].students[req.session.username].API, classId)
        
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