const { isLoggedIn, permCheck } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { BANNED_PERMISSIONS } = require("../modules/permissions")
const { setClassOfApiSockets, advancedEmitToClass } = require("../modules/socketUpdates")

function joinClass(username, code) {
	return new Promise((resolve, reject) => {
		try {
			logger.log('info', `[joinClass] username=(${username}) classCode=(${code})`)

			// Find the id of the class from the database
			database.get('SELECT id FROM classroom WHERE key=?', [code], (err, classroom) => {
				try {
					if (err) {
						reject(err)
						return
					}

					// Check to make sure there was a class with that code
					if (!classroom || !classInformation[code]) {
						logger.log('info', '[joinClass] No open class with that code')
						resolve('no open class with that code')
						return
					}

					// Find the id of the user who is trying to join the class
					database.get('SELECT id FROM users WHERE username=?', [username], (err, user) => {
						try {
							if (err) {
								reject(err)
								return
							}

							if (!user) {
								logger.log('critical', '[joinClass] User is not in database')
								resolve('user is not in database')
								return
							}

							// Add the two id's to the junction table to link the user and class
							database.get('SELECT * FROM classusers WHERE classId=? AND studentId=?', [classroom.id, user.id], (err, classUser) => {
								try {
									if (err) {
										reject(err)
										return
									}

									if (classUser) {
										// Get the student's session data ready to transport into new class
										let user = classInformation.noClass.students[username]
										if (classUser.permissions <= BANNED_PERMISSIONS) {
											logger.log('info', '[joinClass] User is banned')
											resolve('you are banned from that class')
											return
										}

										user.classPermissions = classUser.permissions

										// Remove student from old class
										delete classInformation.noClass.students[username]
										// Add the student to the newly created class
										classInformation[code].students[username] = user


										advancedEmitToClass('joinSound', code, { api: true })

										logger.log('verbose', `[joinClass] cD=(${classInformation})`)
										resolve(true)
									} else {
										database.run('INSERT INTO classusers(classId, studentId, permissions, digiPogs) VALUES(?, ?, ?, ?)',
											[classroom.id, user.id, classInformation[code].permissions.userDefaults, 0], (err) => {
												try {
													if (err) {
														reject(err)
														return
													}

													logger.log('info', '[joinClass] Added user to classusers')

													let user = classInformation.noClass.students[username]
													user.classPermissions = classInformation[code].permissions.userDefaults

													// Remove student from old class
													delete classInformation.noClass.students[username]
													// Add the student to the newly created class
													classInformation[code].students[username] = user
													logger.log('verbose', `[joinClass] cD=(${classInformation})`)
													resolve(true)
												} catch (err) {
													reject(err)
												}
											}
										)
									}
								} catch (err) {
									reject(err)
								}
							})
						} catch (err) {
							reject(err)
						}
					})
				} catch (err) {
					reject(err)
				}
			})
		} catch (err) {
			reject(err)
		}
	})
}

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
        
        // Adds user to a selected class, typically from the select class page
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