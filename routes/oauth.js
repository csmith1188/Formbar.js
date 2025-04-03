const { compare } = require('../modules/crypto');
const { classInformation } = require('../modules/class');
const { logNumbers } = require('../modules/config');
const { database, dbGetAll, dbGet } = require('../modules/database');
const { logger } = require('../modules/logger');
const { getUserClass } = require('../modules/user');
const jwt = require('jsonwebtoken');

function generateAccessToken(userData, classId, refreshToken) {
    const token = jwt.sign({
        id: userData.id,
        username: userData.username,
        permissions: userData.permissions,
        classPermissions: userData.classPermissions,
        classrooms: userData.classrooms,
        activeClasses: userData.activeClasses,
        class: classId,
        refreshToken
    }, userData.secret, { expiresIn: '30m' });

    return token;
};

function generateRefreshToken(userData) {
    const token = jwt.sign({
        id: userData.id,
        username: userData.username
    }, userData.secret, { expiresIn: '14d' });

    return token;
};

function storeRefreshToken(userId, refreshToken) {
    const decodedRefreshToken = jwt.decode(refreshToken)
    database.run('INSERT OR REPLACE INTO refresh_tokens (user_id, refresh_token, exp) VALUES (?, ?, ?)', [userId, refreshToken, decodedRefreshToken.exp], (err) => {
        if (err) throw err;
    });
};

// Retrieves extra data and adds it to the user data provided
async function createUserData(userData) {
    const classId = getUserClass(userData.username);
    const classroomData = await dbGetAll('SELECT * FROM classroom WHERE owner=?', [userData.id]);
    for (const classroomName in classroomData) {
        // Retrieve all students in the class
        const classroom = classroomData[classroomName];
        const classUsers = await dbGetAll('SELECT * FROM classusers WHERE classId=?', [classroom.id]);

        // Add student information from users table
        for (const student of classUsers) {
            const studentData = await dbGet('SELECT * FROM users WHERE id=?', [student.studentId]);
            student.username = studentData.username;
            student.displayName = studentData.displayName;
            student.digipogs = studentData.digipogs;
            student.tags = studentData.tags;
            student.verified = studentData.verified;

            classUsers[student.username] = student;
        }

        // Add students to classroom
        classroom.students = classUsers;
    }
    
    userData.classPermissions = null;
    userData.classrooms = classroomData;
    userData.activeClasses = classInformation.users[userData.username] ? classInformation.users[userData.username].activeClasses : [];
    if (classInformation.classrooms[classId] && classInformation.classrooms[classId].students[userData.username]) {
        userData.classPermissions = classInformation.classrooms[classId].students[userData.username].classPermissions;
    }
    
    return userData;
}

module.exports = {
    run(app) {
        /* 
        This is what happens when the server tries to authenticate a user. 
        It saves the redirectURL query parameter to a variable, and sends the redirectURL to the oauth page.
        If a refresh token is provided, it will find the user associated with the token and generate a new access token.
        */
        app.get('/oauth', (req, res) => {
            try {
                const redirectURL = req.query.redirectURL;
                const refreshToken = req.query.refreshToken;
                if (!redirectURL) {
                    res.render('pages/message', {
                        message: 'No redirectURL provided',
                        title: 'Error'
                    });
                    return;
                };
                logger.log('info', `[get /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log('verbose', `[get /oauth] redirectURL=(${redirectURL}) refreshToken=(${refreshToken})`);

                if (refreshToken) {
                    database.get('SELECT * FROM refresh_tokens WHERE refresh_token=?', [refreshToken], (err, refreshTokenData) => {
                        if (err) throw err;
                        if (!refreshTokenData) {
                            // Invalid refresh token
                            res.redirect(`/oauth?redirectURL=${redirectURL}`);
                            return;
                        };
                        
                        database.get('SELECT * FROM users WHERE id=?', [refreshTokenData.user_id], async (err, userData) => {
                            if (err) throw err;
                            if (userData) {
                                userData = await createUserData(userData);
                                
                                // Generate new access token
                                const accessToken = generateAccessToken(userData, classId, refreshTokenData.refresh_token);
                                res.redirect(`${redirectURL}?token=${accessToken}`);
                            } else {
                                // Invalid user
                                res.redirect(`/oauth?redirectURL=${redirectURL}`);
                            };
                        });
                    });
                } else if (req.session.userId) {
                    database.get('SELECT * FROM users WHERE id=?', [req.session.userId], (err, userData) => {
                        if (err) throw err;
                        if (userData) {
                            database.get('SELECT * FROM refresh_tokens WHERE user_id=?', [req.session.userId], async (err, refreshTokenData) => {
                                if (err) throw err;
                                if (refreshTokenData) {
                                    // Check if refresh token is past expiration date
                                    const decodedRefreshToken = jwt.decode(refreshTokenData.refresh_token);
                                    const currentTime = Math.floor(Date.now() / 1000);
                                    if (decodedRefreshToken.exp < currentTime) {
                                        // Generate new refresh token
                                        const refreshToken = generateRefreshToken(req.session.userId);
                                        storeRefreshToken(req.session.userId, refreshToken);
                                        return;
                                    };

                                    userData = await createUserData(userData);

                                    // Generate access token
                                    const classId = getUserClass(req.session.username);
                                    const accessToken = generateAccessToken(userData, classId, refreshTokenData.refresh_token);
                                    res.redirect(`${redirectURL}?token=${accessToken}`);
                                } else {
                                    const refreshToken = generateRefreshToken(userData);
                                    storeRefreshToken(req.session.userId, refreshToken);
                                    // Invalid refresh token
                                    res.redirect(`/oauth?redirectURL=${redirectURL}`);
                                };
                            });
                        } else {
                            // Invalid user
                            res.render('pages/message', {
                                title: 'Error',
                                message: 'Invalid user'
                            });
                        };
                    });
                } else {
                    // Render the login page and pass the redirectURL
                    res.render('pages/login', {
                        title: 'Oauth',
                        redirectURL: redirectURL,
                        route: 'oauth'
                    });
                };          
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            };
        });

        // This is what happens after the user submits their authentication data.
        app.post('/oauth', (req, res) => {
            try {
                // It saves the username, password, and the redirectURL that is submitted.
                const { username, password, redirectURL } = req.body;

                logger.log('info', `[post /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log('verbose', `[post /oauth] username=(${username}) redirectURL=(${redirectURL})`);

                console.log(1)

                if (!username) {
                    console.log(2)
                    res.render('pages/message', {
                        message: 'Please enter a username',
                        title: 'Login'
                    });
                    return;
                };

                if (!password) {
                    console.log(3)
                    res.render('pages/message', {
                        message: 'Please enter a password',
                        title: 'Login'
                    });
                    return;
                };

                database.get('SELECT * FROM users WHERE username=?', [username], async (err, userData) => {
                    try {
                        console.log(4)
                        if (err) throw err;

                        // Check if the user exists
                        if (!userData) {
                            logger.log('verbose', '[post /oauth] User does not exist')
                            res.render('pages/message', {
                                message: 'No user found with that username.',
                                title: 'Login'
                            });
                            return;
                        };

                        // Hashes users password
                        const passwordMatches = await compare(password, userData.password);
                        console.log(5)
                        if (!passwordMatches) {
                            logger.log('verbose', '[post /oauth] Incorrect password')
                            res.render('pages/message', {
                                message: 'Incorrect password',
                                title: 'Login'
                            });
                            return;
                        };

                        userData = await createUserData(userData);

                        // Retrieve or generate refresh token
                        database.get('SELECT * from refresh_tokens WHERE user_id=?', [userData.id], (err, refreshTokenData) => {
                            console.log(6)
                            if (err) throw err;
                            
                            let refreshToken = null;
                            if (refreshTokenData) {
                                console.log(7)
                                // Check if refresh token is past expiration date
                                const decodedRefreshToken = jwt.decode(refreshTokenData.refresh_token);
                                const currentTime = Math.floor(Date.now() / 1000);
                                if (decodedRefreshToken.exp < currentTime) {
                                    // Generate new refresh token
                                    refreshToken = generateRefreshToken(userData);
                                    storeRefreshToken(userData.id, refreshToken);
                                };

                                refreshToken = refreshTokenData.refresh_token;
                            } else {
                                console.log(8)
                                refreshToken = generateRefreshToken(userData);
                                storeRefreshToken(userData.id, refreshToken);
                            };
                            console.log(11)
                            // Generate access token
                            const classId = getUserClass(userData.username);
                            const accessToken = generateAccessToken(userData, classId, refreshToken);
                                                
                            logger.log('verbose', '[post /oauth] Successfully Logged in with oauth');
                            res.redirect(`${redirectURL}?token=${accessToken}`);
                        });
                    } catch (err) {
                        console.log(9)
                        logger.log('error', err.stack);
                        res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        });
                    };
                });
            } catch (err) {
                console.log(10)
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            };
        });
    }
};