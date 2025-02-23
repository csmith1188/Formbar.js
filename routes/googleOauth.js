const { passport } = require('../modules/googleOauth.js');
const { database } = require('../modules/database.js');
const { STUDENT_PERMISSIONS, MANAGER_PERMISSIONS } = require('../modules/permissions.js');
const { classInformation } = require('../modules/class');
const { managerUpdate } = require('../modules/socketUpdates');
const { Student } = require('../modules/student');
const { logger } = require('../modules/logger');
const crypto = require('crypto');

function checkEnv(req, res, next) {
	if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
		res.redirect('/');
	} else {
		next();
	}
}

function checkRedirect(req, res, next) {
	if (req.query.redirect) {
		req.session.redirect = req.query.redirect;
	} else if (req.session.redirect) {
		req.query.redirect = req.session.redirect;
	};
	next();
};

module.exports = {
	run(app) {
		// Use the passport middleware
		app.use(passport.initialize());
		app.use(passport.session());

		// Use the Passport strategy to authenticate the user through Google
		app.get('/auth/google', checkEnv, checkRedirect, passport.authenticate('google', { scope: ['profile', 'email'] }));
		
		// Handle the callback after Google has authenticated the user
		// If the authentication fails, redirect the user back to the home page
		app.get('/auth/google/callback', checkEnv, checkRedirect, passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
			if (req.query.redirect) req.session.redirect = req.query.redirect;
			// Get the user by their email
			database.get(`SELECT * FROM users WHERE email=?`, [req.user.emails[0].value], (err, user) => {
				if (err) throw err;
				let permissions;

				// If the database is empty, set the first user to be a manager
				database.all(`SELECT * FROM users`, (err, users) => {
					if (err) throw err;
					if (users.length == 0) {
						permissions = MANAGER_PERMISSIONS;
					} else {
						permissions = STUDENT_PERMISSIONS;
					};
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
							// Log the user in
							database.get('SELECT * FROM users WHERE email=?', [req.user.emails[0].value], (err, userData) => {
								if (err) throw err;
								classInformation.users[userData.username] = new Student(
									userData.username,
									userData.id,
									userData.permissions,
									userData.API,
									[], // Owned polls
									[], // Shared polls
									userData.tags,
									userData.displayName,
									false
								);
								
								// Add the user to the session in order to transfer data between each page
								req.session.userId = userData.id;
								req.session.username = userData.username;
								req.session.email = userData.email;
								req.session.classId = null;
								req.session.displayName = userData.displayName;
								req.session.verified = 1;
								
								// Log the information
								logger.log('verbose', `[auth/google/callback] session=(${JSON.stringify(req.session)})`);
								logger.log('verbose', `[auth/google/callback] classInformation=(${JSON.stringify(classInformation)})`);
								
								// Update the manager and redirect the user to the home page
								managerUpdate();
								if (req.session.redirect) {
									res.redirect(req.session.redirect);
								} else {
									res.redirect('/');
								};
							});
						});

						// If the user does exist, remove their password and verify them
					} else if (user.password) {
						database.run(`UPDATE users SET password=?, verified=? WHERE email=?`, ['', 1, req.user.emails[0].value], (err) => {
							if (err) throw err;
							// Log the user in
							database.get('SELECT * FROM users WHERE email=?', [req.user.emails[0].value], (err, userData) => {
								if (err) throw err;

								classInformation.users[userData.username] = new Student(
									userData.username,
									userData.id,
									userData.permissions,
									userData.API,
									[], // Owned polls
									[], // Shared polls
									userData.tags,
									userData.displayName,
									false
								);

								// Add the user to the session in order to transfer data between each page
								req.session.userId = userData.id;
								req.session.username = userData.username;
								req.session.email = userData.email;
								req.session.classId = null;
								req.session.displayName = userData.displayName;
								req.session.verified = 1;

								// Log the information
								logger.log('verbose', `[auth/google/callback] session=(${JSON.stringify(req.session)})`);
								logger.log('verbose', `[auth/google/callback] classInformation=(${JSON.stringify(classInformation)})`);

								// Update the manager and redirect the user to the home page
								managerUpdate();
								if (req.session.redirect) {
									res.redirect(req.session.redirect);
								} else {
									console.log(req.session.redirect);
									res.redirect('/');
								};
							});
						});
					} else {
						// Log the user in
						database.get('SELECT * FROM users WHERE email=?', [req.user.emails[0].value], (err, userData) => {
							if (err) throw err;
							classInformation.users[userData.username] = new Student(
								userData.username,
								userData.id,
								userData.permissions,
								userData.API,
								[], // Owned polls
								[], // Shared polls
								userData.tags,
								userData.displayName,
								false
							);

							// Add the user to the session
							req.session.userId = userData.id;
							req.session.username = userData.username;
							req.session.email = userData.email;
							req.session.classId = null;
							req.session.displayName = userData.displayName;
							req.session.verified = 1;

							// Log the information
							logger.log('verbose', `[auth/google/callback] session=(${JSON.stringify(req.session)})`);
							logger.log('verbose', `[auth/google/callback] classInformation=(${JSON.stringify(classInformation)})`);

							// Update the manager and redirect the user to the home page
							managerUpdate();
							if (req.session.redirect) {
								res.redirect(req.session.redirect);
							} else {
								console.log(req.session.redirect);
								res.redirect('/');
							};
						});
					};
				});
			});
		});
	}
};