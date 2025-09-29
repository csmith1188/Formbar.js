const { hash, compare } = require('../modules/crypto');
const { database, dbRun, dbGet } = require("../modules/database");
const { classInformation } = require("../modules/class/classroom");
const { settings, logNumbers } = require("../modules/config");
const { logger } = require("../modules/logger");
const { Student } = require("../modules/student");
const { STUDENT_PERMISSIONS, MANAGER_PERMISSIONS, GUEST_PERMISSIONS } = require("../modules/permissions");
const { managerUpdate } = require("../modules/socketUpdates");
const { sendMail, limitStore, RATE_LIMIT } = require('../modules/mail.js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Regex to test if the password and display name are valid
const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()\-_+=\{\}\[\]<>,.:;'\"~?/\|\\]{5,20}$/;
const displayRegex = /^[a-zA-Z0-9_ ]{5,20}$/;

module.exports = {
    run(app) {
        app.get('/login', async (req, res) => {
            try {
                // If a code is provided, look for the matching token in the database
                const code = req.query.code;
                let token;
                if (code) {
                    token = (await dbGet('SELECT token FROM temp_user_creation_data WHERE secret=?', [code])).token;
                }

                // If the user is already logged in, redirect them to the home page
                if (req.session.email !== undefined && classInformation.users[req.session.email]) {
                    res.redirect('/');
                    return;
                }

                // If the user is not logged in, render the login page
                if (!token) {
                    logger.log('info', `[get /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                    res.render('pages/login', {
                        title: 'Login',
                        redirectURL: undefined,
                        googleOauthEnabled: settings.googleOauthEnabled,
                        route: 'login'
                    });
                    return;
                } else {
                    // Decode the user account data from the stored token
                    const user = jwt.decode(token);

                    // If the codes don't match, wipe the create data and render a message saying the codes don't match
                    if (code !== user.newSecret) {
                        res.render('pages/message', {
                            message: 'Invalid verification code. Please try again.',
                            title: 'Error'
                        });
                        return;
                    };

                    database.run(
                        'INSERT INTO users(email, password, permissions, API, secret, displayName, verified) VALUES(?, ?, ?, ?, ?, ?, ?)',
                        [
                            user.email,
                            user.hashedPassword,
                            user.permissions,
                            user.newAPI,
                            user.newSecret,
                            user.displayName,
                            1
                        ], (err) => {
                            try {
                                if (err) throw err
                                logger.log('verbose', '[get /login] Added user to database')
                                // Find the user in which was just created to get the id of the user
                                database.get('SELECT * FROM users WHERE email=?', [user.email], (err, userData) => {
                                    try {
                                        if (err) throw err;
                                        classInformation.users[userData.email] = new Student(
                                            userData.email,
                                            userData.id,
                                            userData.permissions,
                                            userData.API,
                                            [],
                                            [],
                                            userData.tags,
                                            userData.displayName,
                                            false
                                        );
                                        // Add the user to the session in order to transfer data between each page
                                        req.session.userId = userData.id
                                        req.session.email = userData.email
                                        req.session.classId = null
                                        req.session.displayName = userData.displayName;
                                        req.session.verified = 1

                                        // Remove the account creation data from the database
                                        dbRun('DELETE FROM temp_user_creation_data WHERE secret=?', [user.newSecret]);

                                        logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
                                        logger.log('verbose', `[post /login] classInformation=(${JSON.stringify(classInformation)})`)

                                        managerUpdate()

                                        res.redirect('/')
                                        return;
                                    } catch (err) {
                                        logger.log('error', err.stack);
                                        res.render('pages/message', {
                                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                            title: 'Error'
                                        });
                                        return;
                                    }
                                });
                            } catch (err) {
                                // Handle the same email being used for multiple accounts
                                if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('UNIQUE constraint failed: users.email')) {
                                    logger.log('verbose', '[post /login] Email already exists')
                                    res.render('pages/message', {
                                        message: 'A user with that email already exists.',
                                        title: 'Login'
                                    });
                                    return;
                                }

                                // Handle other errors
                                logger.log('error', err.stack);
                                res.render('pages/message', {
                                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                    title: 'Error'
                                })
                                return;
                            };
                        });
                };
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
        // It uses the emails, passwords, etc. to verify that it is the user that wants to log in logging in
        // This also hashes passwords to make sure people's accounts don't get hacked
        app.post('/login', (req, res) => {
            try {
                const user = {
                    password: req.body.password,
                    email: req.body.email,
                    loginType: req.body.loginType,
                    userType: req.body.userType,
                    displayName: req.body.displayName,
                    classID: req.body.classID
                };
                logger.log('info', `[post /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)}`)
                logger.log('verbose', `[post /login] email=(${user.email}) password=(${Boolean(user.password)}) loginType=(${user.loginType}) userType=(${user.userType})`)

                // Check whether user is logging in or signing up
                if (user.loginType == 'login') {
                    logger.log('verbose', '[post /login] User is logging in');

                    // Get the users login in data to verify password
                    database.get('SELECT users.*, CASE WHEN shared_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT shared_polls.pollId) END as sharedPolls, CASE WHEN custom_polls.id IS NULL THEN json_array() ELSE json_group_array(DISTINCT custom_polls.id) END as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.email=?', [user.email], async (err, userData) => {
                        try {
                            // Check if a user with that name was not found in the database
                            if (!userData.email) {
                                logger.log('verbose', '[post /login] User does not exist')
                                res.render('pages/message', {
                                    message: 'No user found with that email.',
                                    title: 'Login'
                                });
                                return;
                            };

                            // Compare password hashes and check if it is correct
                            const passwordMatches = await compare(user.password, userData.password);
                            if (!passwordMatches) {
                                logger.log('verbose', '[post /login] Incorrect password')
                                res.render('pages/message', {
                                    message: 'Incorrect password',
                                    title: 'Login'
                                })
                                return
                            }

                            // If the user does not have a display name, set it to their email
                            if (!userData.displayName) {
                                database.run("UPDATE users SET displayName = ? WHERE email = ?", [userData.email, userData.email]), (err) => {
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

                            let loggedIn = false
                            let classId = ''
                            for (let classData of Object.values(classInformation.classrooms)) {
                                if (classData.key) {
                                    for (let email of Object.keys(classData.students)) {
                                        if (email == userData.email) {
                                            loggedIn = true
                                            classId = classData.id
                                            break
                                        }
                                    }
                                }
                            }

                            if (loggedIn) {
                                logger.log('verbose', '[post /login] User is already logged in')
                                req.session.classId = classId
                            } else {
                                classInformation.users[userData.email] = new Student(
                                    userData.email,
                                    userData.id,
                                    userData.permissions,
                                    userData.API,
                                    JSON.parse(userData.ownedPolls),
                                    JSON.parse(userData.sharedPolls),
                                    userData.tags,
                                    userData.displayName,
                                    false
                                )

                                req.session.classId = null;
                            }

                            // Add a cookie to transfer user credentials across site
                            req.session.userId = userData.id;
                            req.session.email = userData.email;
                            req.session.tags = userData.tags;
                            req.session.displayName = userData.displayName;
                            req.session.verified = userData.verified;
                            // Log the login post
                            logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
                            logger.log('verbose', `[post /login] classInformation=(${JSON.stringify(classInformation)})`)

                            // If the user was logging in from the consent page, redirect them back to the consent page
                            if (req.body.route === 'transfer') {
                                res.redirect(req.body.redirectURL);
                                return;
                            }

                            // Redirect the user to the home page to be redirected to the correct spot
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
                    // Check if the password and display name are valid
                    if (!passwordRegex.test(user.password) || !displayRegex.test(user.displayName)) {
                        logger.log('verbose', '[post /login] Invalid data provided to create new user');
                        res.render('pages/message', {
                            message: 'Invalid password or display name. Please try again.',
                            title: 'Login'
                        });
                        return;
                    }

                    // Trim whitespace from email
                    user.email = user.email.trim()

                    logger.log('verbose', '[post /login] Creating new user')
                    let permissions = STUDENT_PERMISSIONS
                    database.all('SELECT API, secret, email FROM users', async (err, users) => {
                        try {
                            if (err) throw err

                            let existingAPIs = []
                            let existingSecrets = []
                            let newAPI
                            let newSecret

                            // If there are no users in the database, the first user is a manager
                            if (users.length == 0) {
                                permissions = MANAGER_PERMISSIONS
                            }

                            for (let dbUser of users) {
                                existingAPIs.push(dbUser.API)
                                existingSecrets.push(dbUser.secret)
                                if (dbUser.email == user.email) {
                                    logger.log('verbose', '[post /login] User already exists')
                                    res.render('pages/message', {
                                        message: 'A user with that email already exists.',
                                        title: 'Login'
                                    })
                                    return
                                }
                            }

                            do {
                                newAPI = crypto.randomBytes(32).toString('hex')
                            } while (existingAPIs.includes(newAPI))

                            do {
                                newSecret = crypto.randomBytes(256).toString('hex')
                            } while (existingSecrets.includes(newSecret))

                            // Hash the provided password
                            const hashedPassword = await hash(user.password);

                            if (!settings.emailEnabled) {
                                user.newAPI = newAPI;
                                user.newSecret = newSecret;
                                user.hashedPassword = hashedPassword;
                                user.permissions = permissions;
                                database.run(
                                    'INSERT INTO users(email, password, permissions, API, secret, displayName, verified) VALUES(?, ?, ?, ?, ?, ?, ?)',
                                    [
                                        user.email,
                                        user.hashedPassword,
                                        user.permissions,
                                        user.newAPI,
                                        user.newSecret,
                                        user.displayName,
                                        1
                                    ], (err) => {
                                        try {
                                            if (err) throw err
                                            logger.log('verbose', '[get /login] Added user to database')
                                            // Find the user in which was just created to get the id of the user
                                            database.get('SELECT * FROM users WHERE email=?', [user.email], (err, userData) => {
                                                try {
                                                    if (err) throw err;
                                                    classInformation.users[userData.email] = new Student(
                                                        userData.email,
                                                        userData.id,
                                                        userData.permissions,
                                                        userData.API,
                                                        [],
                                                        [],
                                                        userData.tags,
                                                        userData.displayName,
                                                        false
                                                    );
                                                    // Add the user to the session in order to transfer data between each page
                                                    req.session.userId = userData.id
                                                    req.session.email = userData.email
                                                    req.session.classId = null
                                                    req.session.displayName = userData.displayName;
                                                    req.session.verified = 1;

                                                    logger.log('verbose', `[post /login] session=(${JSON.stringify(req.session)})`)
                                                    logger.log('verbose', `[post /login] classInformation=(${JSON.stringify(classInformation)})`)

                                                    managerUpdate()

                                                    res.redirect('/')
                                                    return;
                                                } catch (err) {
                                                    logger.log('error', err.stack);
                                                    res.render('pages/message', {
                                                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                                        title: 'Error'
                                                    });
                                                    return;
                                                }
                                            });
                                        } catch (err) {
                                            // Handle the same email being used for multiple accounts
                                            if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('UNIQUE constraint failed: users.email')) {
                                                logger.log('verbose', '[post /login] Email already exists')
                                                res.render('pages/message', {
                                                    message: 'A user with that email already exists.',
                                                    title: 'Login'
                                                });
                                                return;
                                            }

                                            // Handle other errors
                                            logger.log('error', err.stack);
                                            res.render('pages/message', {
                                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                                title: 'Error'
                                            })
                                            return;
                                        };
                                    });
                                return;
                            };

                            // Set the creation data for the user
                            const accountCreationData = user;
                            accountCreationData.newAPI = newAPI;
                            accountCreationData.newSecret = newSecret;
                            accountCreationData.hashedPassword = hashedPassword;
                            accountCreationData.permissions = permissions;
                            accountCreationData.password = undefined;

                            // Create JWT token with this information then store it in the temp_user_creation_data in the database
                            // This will be used to finish creating the account once the email is verified
                            const token = jwt.sign(accountCreationData, newSecret, { expiresIn: '1h' });
                            await dbRun('INSERT INTO temp_user_creation_data(token, secret) VALUES(?, ?)', [token, newSecret]);

                            // Get the web address for Formbar to send in the email
                            const location = `${req.protocol}://${req.get('host')}`;

                            // Create the HTML content for the email
                            const html = `
                            <h1>Verify your email</h1>
                            <p>Click the link below to verify your email address with Formbar</p>
                                <a href='${location}/login?code=${newSecret}'>Verify Email</a>
                            `;

                            // Send the email
                            sendMail(user.email, 'Formbar Verification', html);
                            if (limitStore.has(user.email) && (Date.now() - limitStore.get(user.email) < RATE_LIMIT)) {
                                res.render('pages/message', {
                                    message: `Email has been rate limited. Please wait ${Math.ceil((limitStore.get(user.email) + RATE_LIMIT - Date.now()) / 1000)} seconds.`,
                                    title: 'Verification'
                                });
                            } else {
                                res.render('pages/message', {
                                    message: 'Verification email sent. Please check your email.',
                                    title: 'Verification'
                                });
                            };
                        } catch (err) {
                            logger.log('error', err.stack);
                            res.render('pages/message', {
                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                title: 'Error'
                            })
                        }
                    })
                } else if (user.loginType == 'guest') {

                    if (user.displayName.trim() == '') {
                        logger.log('verbose', '[post /login] Invalid display name provided to create guest user');
                        res.render('pages/message', {
                            message: 'Invalid display name. Please try again.',
                            title: 'Login'
                        });
                        return;
                    }
                    logger.log('verbose', '[post /login] Logging in as guest');

                    // Create a temporary guest user
                    const email = 'guest' + crypto.randomBytes(4).toString('hex');
                    const student = new Student(
                        email, // email
                        `guest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, // Unique ID for guest
                        GUEST_PERMISSIONS,
                        null, // API key
                        [], // Owned polls
                        [], // Shared polls
                        "", // Tags
                        user.displayName,
                        true
                    );
                    classInformation.users[student.email] = student;

                    // Set their current class to no class
                    req.session.classId = null;

                    // Add a cookie to transfer user credentials across site
                    req.session.userId = student.id;
                    req.session.email = student.email;
                    req.session.tags = student.tags;
                    req.session.displayName = student.displayName;
                    req.session.verified = student.verified;
                    res.redirect('/');
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