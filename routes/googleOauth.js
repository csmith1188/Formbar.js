const passport = require('../modules/googleOauth.js').passport;
const database = require('../modules/database.js').database;
const { permission } = require('process');
const {STUDENT_PERMISSIONS, MANAGER_PERMISSIONS} = require('../modules/permissions.js');
const crypto = require('crypto');

module.exports = {
    run(app) {
        // Use the passport middleware
        app.use(passport.initialize());
        app.use(passport.session());

        // Use the Passport stratefy to authenticate the user through Google
        app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
        
        // Handle the callback after Google has authenticated the user
        app.get('/auth/google/callback',
            // If the authentication fails, redirect the user back to the home page
            passport.authenticate('google', { failureRedirect: '/' }),
            (req, res) => {
                // Get the user by their email
                database.get(`SELECT * FROM users WHERE email=?`, [req.user.emails[0].value], (err, user) => {
                    if (err) throw err;
                    let permissions;
                    // If the database is empty, set the first user to be a manager
                    if (database.get(`SELECT * FROM users`).length == 0) {
                        permissions = MANAGER_PERMISSIONS;
                    } else {
                        permissions = STUDENT_PERMISSIONS;
                    }
                    // If there is no user, insert them into the database
                    if (!user) {
                        database.run(`INSERT INTO users (username, email, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                            // Set the username to the family name + the given name, while removing spaces and special characters
                            req.user.name.familyName.replace(/[^a-zA-Z]/g, '') + req.user.name.givenName.replace(/[^a-zA-Z]/g, ''),
                            req.user.emails[0].value,
                            permissions,
                            newAPI = crypto.randomBytes(64).toString('hex'),
                            newSecret = crypto.randomBytes(256).toString('hex'),
                            req.user.name.givenName + ' ' + req.user.name.familyName,
                            1 // Automatically verify the user, since they need their email use Google oauth
                        ], (err) => {
                            if (err) throw err;
                        });
                    // If the user does exist, remove their password and verify them
                    } else if (user.password) {
                        database.run(`UPDATE users WHERE email=? SET password=?, verified=?`, [req.user.emails[0].value, '', 1], (err) => {
                            if (err) throw err;
                        });
                    }
                });
                // Redirect the user to the home page
                res.redirect('/');
            }
        );
    }
};