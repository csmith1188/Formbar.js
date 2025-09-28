const { compare } = require('../modules/crypto');
const { classInformation } = require('../modules/class/classroom');
const { logNumbers, privateKey } = require('../modules/config');
const { database, dbGetAll, dbGet } = require('../modules/database');
const { logger } = require('../modules/logger');
const { getUserClass } = require('../modules/user');
const config = require('../modules/config');
const jwt = require('jsonwebtoken');

function generateAccessToken(userData, refreshToken) {
    const token = jwt.sign({
        id: userData.id,
        email: userData.email,
        displayName: userData.displayName,
        permissions: userData.permissions,
        classPermissions: userData.classPermissions,
        classrooms: userData.classrooms,
        activeClass: userData.activeClass,
        refreshToken
    }, privateKey, { algorithm: 'RS256' }, { expiresIn: '30m' });

    return token;
}

function generateRefreshToken(userData) {
    const token = jwt.sign({
        id: userData.id,
        email: userData.email
    }, privateKey, { algorithm: 'RS256' }, { expiresIn: '14d' });

    return token;
}

function storeRefreshToken(userId, refreshToken) {
    const decodedRefreshToken = jwt.verify(refreshToken, privateKey, { algorithms: ['RS256'] });
    database.run('INSERT OR REPLACE INTO refresh_tokens (user_id, refresh_token, exp) VALUES (?, ?, ?)', [userId, refreshToken, decodedRefreshToken.iat], (err) => {
        if (err) throw err;
    });
}

// Retrieves classroom-related data for the user for OAuth
async function createUserData(userData) {
    // Get the user's class and classroom data
    const classId = getUserClass(userData.email);
    const classroomData = await dbGetAll('SELECT * FROM classroom WHERE owner=?', [userData.id]);

    // Set classroom-related data
    userData.classPermissions = null;
    userData.classrooms = classroomData;
    userData.activeClass = classInformation.users[userData.email] ? classInformation.users[userData.email].activeClass : null;
    if (classInformation.classrooms[classId] && classInformation.classrooms[classId].students[userData.email]) {
        userData.classPermissions = classInformation.classrooms[classId].students[userData.email].classPermissions;
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
                }

                logger.log('info', `[get /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log('verbose', `[get /oauth] redirectURL=(${redirectURL}) refreshToken=(${refreshToken})`);

                if (refreshToken) {
                    database.get('SELECT * FROM refresh_tokens WHERE refresh_token=?', [refreshToken], (err, refreshTokenData) => {
                        if (err) throw err;
                        if (!refreshTokenData) {
                            // Invalid refresh token
                            res.redirect(`/oauth?redirectURL=${redirectURL}`);
                            return;
                        }
                        
                        database.get('SELECT * FROM users WHERE id=?', [refreshTokenData.user_id], async (err, userData) => {
                            if (err) throw err;
                            if (userData) {
                                userData = await createUserData(userData);
                                
                                // Generate new access token
                                const accessToken = generateAccessToken(userData, refreshTokenData.refresh_token);
                                const querySeparator = redirectURL.includes('?') ? '&' : '?'; // In case the redirectURL already has a query string
                                res.redirect(`${redirectURL}${querySeparator}token=${accessToken}`);
                            } else {
                                // Invalid user
                                res.redirect(`/oauth?redirectURL=${redirectURL}`);
                            }
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
                                    }

                                    userData = await createUserData(userData);

                                    // Generate access token
                                    const accessToken = generateAccessToken(userData, refreshTokenData.refresh_token);
                                    const querySeparator = redirectURL.includes('?') ? '&' : '?'; // In case the redirectURL already has a query string
                                    res.redirect(`${redirectURL}${querySeparator}token=${accessToken}`);
                                } else {
                                    const refreshToken = generateRefreshToken(userData);
                                    storeRefreshToken(req.session.userId, refreshToken);
                                    // Invalid refresh token
                                    res.redirect(`/oauth?redirectURL=${redirectURL}`);
                                }
                            });
                        } else {
                            // Invalid user
                            res.render('pages/message', {
                                title: 'Error',
                                message: 'Invalid user'
                            });
                        }
                    });
                } else {
                    // Render the login page and pass the redirectURL
                    res.render('pages/login', {
                        title: 'Oauth',
                        redirectURL: redirectURL,
                        route: 'oauth',
                        googleOauthEnabled: config.settings.googleOauthEnabled
                    });
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            }
        });

        // This is what happens after the user submits their authentication data.
        app.post('/oauth', (req, res) => {
            try {
                // It saves the email, password, and the redirectURL that is submitted.
                const { email, password, redirectURL } = req.body;

                logger.log('info', `[post /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                logger.log('verbose', `[post /oauth] email=(${email}) redirectURL=(${redirectURL})`);

                if (!email) {
                    res.render('pages/message', {
                        message: 'Please enter a an email',
                        title: 'Login'
                    });
                    return;
                }

                if (!password) {
                    res.render('pages/message', {
                        message: 'Please enter a password',
                        title: 'Login'
                    });
                    return;
                }

                database.get('SELECT * FROM users WHERE email=?', [email], async (err, userData) => {
                    try {
                        if (err) throw err;

                        // Check if the user exists
                        if (!userData) {
                            logger.log('verbose', '[post /oauth] User does not exist')
                            res.render('pages/message', {
                                message: 'No user found with that email.',
                                title: 'Login'
                            });
                            return;
                        }

                        // Hashes users password
                        const passwordMatches = await compare(password, userData.password);
                        if (!passwordMatches) {
                            logger.log('verbose', '[post /oauth] Incorrect password')
                            res.render('pages/message', {
                                message: 'Incorrect password',
                                title: 'Login'
                            });
                            return;
                        }

                        userData = await createUserData(userData);

                        // Retrieve or generate refresh token
                        database.get('SELECT * from refresh_tokens WHERE user_id=?', [userData.id], (err, refreshTokenData) => {
                            if (err) throw err;
                            
                            let refreshToken = null;
                            if (refreshTokenData) {
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
                                refreshToken = generateRefreshToken(userData);
                                storeRefreshToken(userData.id, refreshToken);
                            };

                            // Generate access token
                            const accessToken = generateAccessToken(userData, refreshToken);
                                                
                            logger.log('verbose', '[post /oauth] Successfully Logged in with oauth');
                            const querySeparator = redirectURL.includes('?') ? '&' : '?'; // In case the redirectURL already has a query string
                            res.redirect(`${redirectURL}${querySeparator}token=${accessToken}`);
                        });
                    } catch (err) {
                        logger.log('error', err.stack);
                        res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        });
                    }
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            }
        });
    }
};