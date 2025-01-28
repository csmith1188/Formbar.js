const passport = require('../modules/googleOauth.js').passport;
const database = require('../modules/database.js').database;
const { permission } = require('process');
const {STUDENT_PERMISSIONS, MANAGER_PERMISSIONS} = require('../modules/permissions.js');
const crypto = require('crypto');

module.exports = {
    run(app) {
        app.use(passport.initialize());
        app.use(passport.session());

        app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
        
        app.get('/auth/google/callback',
            passport.authenticate('google', { failureRedirect: '/' }),
            (req, res) => {
                database.get(`SELECT * FROM users WHERE email=?`, [req.user.emails[0].value], (err, user) => {
                    if (err) throw err;
                    let permissions;
                    if (database.get(`SELECT * FROM users`).length == 0) {
                        permissions = MANAGER_PERMISSIONS;
                    } else {
                        permissions = STUDENT_PERMISSIONS;
                    }
                    if (!user) {
                        database.run(`INSERT INTO users (username, email, permissions, API, secret, displayName, verified) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                            req.user.name.familyName.replace(/[^a-zA-Z]/g, '') + req.user.name.givenName.replace(/[^a-zA-Z]/g, ''),
                            req.user.emails[0].value,
                            permissions,
                            newAPI = crypto.randomBytes(64).toString('hex'),
                            newSecret = crypto.randomBytes(256).toString('hex'),
                            req.user.name.givenName + ' ' + req.user.name.familyName,
                            1
                        ], (err) => {
                            if (err) throw err;
                        });
                    } else {
                        database.run(`UPDATE users WHERE email=? SET password=?, verified=?`, [req.user.emails[0].value, '', 1], (err) => {
                            if (err) throw err;
                        });
                    }
                });
                res.redirect('/');
            }
        );
    }
};