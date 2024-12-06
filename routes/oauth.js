const { compare } = require('../crypto')
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { getUserClass } = require("../modules/user")
const jwt = require('jsonwebtoken')

module.exports = {
    run(app) {
        /* 
        This is what happens when the server tries to authenticate a user. 
        It saves the redirectURL query parameter to a variable, and sends the redirectURL to the oauth page as a variable. 
        */
        app.get('/oauth', (req, res) => {
            try {
                let redirectURL = req.query.redirectURL

                logger.log('info', `[get /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[get /oauth] redirectURL=(${redirectURL})`)

                // Render the login page and pass the redirectURL
                res.render('pages/login', {
                    title: 'Oauth',
                    redirectURL: redirectURL
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        // This is what happens after the user submits their authentication data.
        app.post('/oauth', (req, res) => {
            try {
                // It saves the username, password, and the redirectURL that is submitted.
                const { username, password, redirectURL } = req.body

                logger.log('info', `[post /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[post /oauth] username=(${username}) redirectURL=(${redirectURL})`)

                if (!username) {
                    res.render('pages/message', {
                        message: 'Please enter a username',
                        title: 'Login'
                    })
                    return
                }

                if (!password) {
                    res.render('pages/message', {
                        message: 'Please enter a password',
                        title: 'Login'
                    })
                    return
                }

                database.get('SELECT * FROM users WHERE username=?', [username], (err, userData) => {
                    try {
                        if (err) throw err

                        // Check if a user with that name was not found in the database
                        if (!userData.username) {
                            logger.log('verbose', '[post /oauth] User does not exist')
                            res.render('pages/message', {
                                message: 'No user found with that username.',
                                title: 'Login'
                            })
                            return
                        }

                        // Hashes users password
                        if (compare(JSON.parse(userData.password), password)) {
                            logger.log('verbose', '[post /oauth] Incorrect password')
                            res.render('pages/message', {
                                message: 'Incorrect password',
                                title: 'Login'
                            })
                            return
                        }

                        let classCode = getUserClass(userData.username)

                        userData.classPermissions = null

                        if (classInformation[classCode] && classInformation[classCode].students[userData.username]) {
                            userData.classPermissions = classInformation[classCode].students[userData.username].classPermissions
                        }

                        // Generate a refresh token
                        const refreshToken = jwt.sign({
                            id: userData.id,
                            username: userData.username
                        }, userData.secret, { expiresIn: '14d' })

                        const token = jwt.sign({
                            id: userData.id,
                            username: userData.username,
                            permissions: userData.permissions,
                            classPermissions: userData.classPermissions,
                            class: classCode,
                            refreshToken
                        }, userData.secret, { expiresIn: '30m' })

                        // Store the refresh token in the database
                        database.run('UPDATE users SET oauthRefreshToken=? WHERE id=?', [refreshToken, userData.id], (err) => {
                            if (err) throw err

                            console.log("Refresh token updated")
                        })

                        logger.log('verbose', '[post /oauth] Successfully Logged in with oauth')
                        res.redirect(`${redirectURL}?token=${token}`)
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

        app.get('/oauthRefresh', (req, res) => {
            const refreshToken = req.query.refreshToken
            try {
                database.get('SELECT * FROM users WHERE oauthRefreshToken=?', [refreshToken], (err, userData) => {
                    if (err) throw err

                    if (!userData) {
                        res.status(401).send('Invalid refresh token')
                        return
                    }
                });
            } catch (err) {
                logger.log('error', err.stack)
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })
    }
}