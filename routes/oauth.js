const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        /* This is what happens when the server tries to authenticate a user. It saves the redirectURL query parameter to a variable, and sends the redirectURL to the oauth page as
        a variable. */
        app.get('/oauth', (req, res) => {
            try {
                let redirectURL = req.query.redirectURL

                logger.log('info', `[get /oauth] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                logger.log('verbose', `[get /oauth] redirectURL=(${redirectURL})`)

                res.render('pages/oauth.ejs', {
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
                const {
                    username,
                    password,
                    redirectURL
                } = req.body

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

                        // Decrypt users password
                        let databasePassword = decrypt(JSON.parse(userData.password))
                        if (databasePassword != password) {
                            logger.log('verbose', '[post /oauth] Incorrect password')
                            res.render('pages/message', {
                                message: 'Incorrect password',
                                title: 'Login'
                            })
                            return
                        }

                        let classCode = getUserClass(userData.username)

                        userData.classPermissions = null

                        if (classInformation[classCode] && classInformation[classCode].students[userData.username])
                            userData.classPermissions = classInformation[classCode].students[userData.username].classPermissions

                        const token = jwt.sign({
                            id: userData.id,
                            username: userData.username,
                            permissions: userData.permissions,
                            classPermissions: userData.classPermissions,
                            class: classCode
                        }, userData.secret, { expiresIn: '30m' })

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
    }
}