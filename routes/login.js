const { hash, compare } = require('../crypto')
const { database } = require("../modules/database")
const { classInformation, getClassIDFromCode } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")
const { Student } = require("../modules/student")
const { STUDENT_PERMISSIONS, MANAGER_PERMISSIONS } = require("../modules/permissions")
const { managerUpdate } = require("../modules/socketUpdates")
const crypto = require('crypto')

module.exports = {
    run(app) {
        // This renders the login page
        // It displays the title and the color of the login page of the formbar js
        // It allows for the login to check if the user wants to login to the server
        // This makes sure the lesson can see the students and work with them
        app.get('/login', (req, res) => {
            try {
                logger.log('info', `[get /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                res.render('pages/login', {
                    title: 'Login',

                    // Pass the redirect URL as undefined so that the EJS file does error upon setting the value of redirect to redirect URL
                    redirectURL: undefined
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        // This lets the user log into the server, it uses each element from the database to allow the server to do so
        // This lets users actually log in instead of not being able to log in at all
        // It uses the usernames, passwords, etc. to verify that it is the user that wants to log in logging in
        // This also hashes passwords to make sure people's accounts don't get hacked
        app.post('/login', async (req, res) => {
            try {
                const user = {
                    username: req.body.username,
                    password: req.body.password,
                    email: req.body.email,
                    loginType: req.body.loginType,
                    userType: req.body.userType,
                    displayName: req.body.displayName
                }
                var passwordCrypt
                var passwordSalt
                await hash('password').then((value) => {
                    passwordCrypt = value.hash;
                    passwordSalt = value.salt;
                }).catch((err) => {
                    console.log('Error hashing password: ' + err);
                });

                logger.log('info', `[post /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)}`)
                logger.log('verbose', `[post /login] username=(${user.username}) password=(${Boolean(user.password)}) loginType=(${user.loginType}) userType=(${user.userType})`)

                // Check whether user is logging in or signing up
                if (user.loginType == 'login') {
                    logger.log('verbose', '[post /login] User is logging in')

                    // Get the users login in data to verify password
                    database.get('SELECT users.*, CASE WHEN shared_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT shared_polls.pollId) END as sharedPolls, CASE WHEN custom_polls.id IS NULL THEN json_array() ELSE json_group_array(DISTINCT custom_polls.id) END as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.username=?', [user.username], async (err, userData) => {
                        try {
                            // Check if a user with that name was not found in the database
                            if (!userData.username) {
                                logger.log('verbose', '[post /login] User does not exist')
                                res.render('pages/message', {
                                    message: 'No user found with that username.',
                                    title: 'Login'
                                })
                                return
                            }

                            if (!userData.displayName) {
                                database.run("UPDATE users SET displayName = ? WHERE username = ?", [userData.username, userData.username]), (err) => {
                                    try {
                                        if (err) throw err;
                                        logger.log('verbose', '[post /login] Added displayName to database');
                                    } catch (err) {
                                        logger.log('error', err.stack);
                                        res.render('pages/message', {
                                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                            title: 'Error'
                                        });
                                    };
                                };
                            };

                            // Compare password hashes and check if it is correct
                            if (compare(JSON.parse(userData.password), passwordCrypt)) {
                                logger.log('verbose', '[post /login] Incorrect password')
                                res.render('pages/message', {
                                    message: 'Incorrect password',
                                    title: 'Login'
                                })
                                return
                            }

                            let loggedIn = false
                            let classKey = ''

                            for (let classData of Object.values(classInformation.classrooms)) {
                                if (classData.key) {
                                    for (let username of Object.keys(classData.students)) {
                                        if (username == userData.username) {
                                            loggedIn = true
                                            classKey = classData.key

                                            break
                                        }
                                    }
                                }
                            }

                            if (loggedIn) {
                                logger.log('verbose', '[post /login] User is already logged in')
                                req.session.class = classKey
                                req.session.classId = getClassIDFromCode(classKey)
                            } else {
                                classInformation.users[userData.username] = new Student(
                                    userData.username,
                                    userData.email,
                                    userData.id,
                                    userData.permissions,
                                    userData.API,
                                    JSON.parse(userData.ownedPolls),
                                    JSON.parse(userData.sharedPolls),
                                    userData.tags,
                                    userData.displayName,
                                    userData.verified
                                )

                                req.session.class = 'noClass';
                                req.session.classId = null;
                            }
                            // Add a cookie to transfer user credentials across site
                            req.session.userId = userData.id;
                            req.session.username = userData.username;
                            req.session.email = userData.email;
                            req.session.tags = userData.tags;
                            req.session.displayName = userData.displayName;
                            req.session.verified = userData.verified;

                            logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
                            logger.log('verbose', `[post /login] cD=(${JSON.stringify(classInformation)})`)

                            res.redirect('/')
                        } catch (err) {
                            logger.log('error', err.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            })
                        }
                    })
                } else if (user.loginType == 'new') {
                    logger.log('verbose', '[post /login] Creating new user')

                    let permissions = STUDENT_PERMISSIONS

                    database.all('SELECT API, secret, username FROM users', (err, users) => {
                        try {
                            if (err) throw err

                            let existingAPIs = []
                            let existingSecrets = []
                            let newAPI
                            let newSecret

                            if (users.length == 0) permissions = MANAGER_PERMISSIONS

                            for (let dbUser of users) {
                                existingAPIs.push(dbUser.API)
                                existingSecrets.push(dbUser.secret)
                                if (dbUser.username == user.username) {
                                    logger.log('verbose', '[post /login] User already exists')
                                    res.render('pages/message', {
                                        message: 'A user with that username already exists.',
                                        title: 'Login'
                                    })
                                    return
                                }
                            }

                            do {
                                newAPI = crypto.randomBytes(64).toString('hex')
                            } while (existingAPIs.includes(newAPI))
                            do {
                                newSecret = crypto.randomBytes(256).toString('hex')
                            } while (existingSecrets.includes(newSecret))

                            // Add the new user to the database
                            database.run(
                                'INSERT INTO users(username, email, password, salt, permissions, API, secret, displayName) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
                                [
                                    user.username,
                                    user.email,
                                    JSON.stringify(passwordCrypt),
                                    JSON.stringify(passwordSalt),
                                    permissions,
                                    newAPI,
                                    newSecret,
                                    user.displayName
                                ], (err) => {
                                    try {
                                        if (err) throw err

                                        logger.log('verbose', '[post /login] Added user to database')

                                        // Find the user in which was just created to get the id of the user
                                        database.get('SELECT * FROM users WHERE username=?', [user.username], (err, userData) => {
                                            try {
                                                if (err) throw err

                                                classInformation.users[userData.username] = new Student(
                                                    userData.username,
                                                    userData.email,
                                                    userData.id,
                                                    userData.permissions,
                                                    userData.API,
                                                    [],
                                                    [],
                                                    userData.tags,
                                                    userData.displayName
                                                )

                                                // Add the user to the session in order to transfer data between each page
                                                req.session.userId = userData.id
                                                req.session.username = userData.username
                                                req.session.class = 'noClass'
                                                req.session.classId = null
                                                req.session.displayName = userData.displayName;

                                                logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
                                                logger.log('verbose', `[post /login] cD=(${JSON.stringify(classInformation)})`)

                                                managerUpdate()

                                                res.redirect('/')
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
                } else if (user.loginType == 'guest') {
                    logger.log('verbose', '[post /login] Logging in as guest')
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