const { isLoggedIn, permCheck } = require("../modules/authentication")
const { classInformation, Classroom } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { BANNED_PERMISSIONS } = require("../modules/permissions")
const { setClassOfApiSockets, advancedEmitToClass } = require("../modules/socketUpdates")

async function joinClass(req, code) {
	const username = req.session.username;
	try {
	
		logger.log('info', `[joinClass] username=(${username}) classCode=(${code})`)

		// Find the id of the class from the database
		const classroom = await new Promise((resolve, reject) => {
			database.get('SELECT * FROM classroom WHERE key=?', [code], (err, classroom) => {
				if (err) {
					reject(err)
					return
				}
				resolve(classroom)
			})
		})

		// Check to make sure there was a class with that code
		if (!classroom) {
			logger.log('info', '[joinClass] No class with that code')
			return 'No class with that code'
		}

		// Load the classroom into the classInformation object if it's not already loaded
		if (!classInformation.classrooms[classroom.id]) {
			classInformation.classrooms[classroom.id] = new Classroom(classroom.id, classroom.name, classroom.key, classroom.permissions, classroom.sharedPolls, classroom.pollHistory, classroom.tags)
		}

		// Find the id of the user who is trying to join the class
		let user = await new Promise((resolve, reject) => {
			database.get('SELECT id FROM users WHERE username=?', [username], (err, user) => {
				if (err) {
					reject(err)
					return
				}
				resolve(user)
			})
		})

		if (!user && !classInformation.users[username]) {
			logger.log('critical', '[joinClass] User is not in database')
			return 'user is not in database'
		} else if (classInformation.users[username] && classInformation.users[username].isGuest) {
			user = classInformation.users[username];
		}

		// If the user is not a guest, then link them to the class
		let classUser
		if (!user.isGuest) {
			// Add the two id's to the junction table to link the user and class
			classUser = await new Promise((resolve, reject) => {
				database.get('SELECT * FROM classusers WHERE classId=? AND studentId=?', [classroom.id, user.id], (err, classUser) => {
					if (err) {
						reject(err)
						return
					}
					resolve(classUser)
				})
			})
		}

		if (classUser) {
			// Get the student's session data ready to transport into new class
			let currentUser = classInformation.users[username]
			if (classUser.permissions <= BANNED_PERMISSIONS) {
				logger.log('info', '[joinClass] User is banned')
				return 'You are banned from that class.'
			}

			currentUser.classPermissions = classUser.permissions

			// Add the student to the newly created class
			classInformation.classrooms[classroom.id].students[username] = currentUser
			classInformation.classrooms[classroom.id].students[username].tags = classInformation.classrooms[classroom.id].students[username].tags.replace('Offline', '')
			classInformation.users[username].tags = classInformation.users[username].tags.replace('Offline', '')
			classInformation.users[username].activeClasses.push(classroom.id)
			advancedEmitToClass('joinSound', classroom.id, { api: true })

			// Set session class and classId
			req.session.classId = classroom.id;

			// Set the class of the API socket
			setClassOfApiSockets(currentUser.API, classroom.id);

			logger.log('verbose', `[joinClass] classInformation=(${classInformation})`)
			return true
		} else {
			// If the user is not a guest, then insert them into the database
			if (!user.isGuest) {
				await new Promise((resolve, reject) => {
					database.run('INSERT INTO classusers(classId, studentId, permissions, digiPogs) VALUES(?, ?, ?, ?)', [classroom.id, user.id, classInformation.classrooms[classroom.id].permissions.userDefaults, 0], (err) => {
						if (err) {
							reject(err)
							return
						}
						resolve()
					})
				})

				logger.log('info', '[joinClass] Added user to classusers')
			}

			// Grab the user from tthe users list
			const currentUser = classInformation.users[username]
			currentUser.classPermissions = classInformation.classrooms[classroom.id].permissions.userDefaults

			// If the user is marked as offline, then remove the tag
			if (currentUser.tags.includes("Offline")) {
				currentUser.tags = currentUser.tags.replace('Offline', '')
			}
			
			// Add the student to the newly created class
			classInformation.classrooms[classroom.id].students[username] = currentUser
			classInformation.users[username].activeClasses.push(classroom.id)

			logger.log('verbose', `[joinClass] classInformation=(${classInformation})`)
			return true
		}
	} catch (err) {
		throw err
	}
}

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
                let classJoinStatus = await joinClass(req, classCode)

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