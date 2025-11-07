const { hash, compare } = require("../modules/crypto");
const { database, dbRun, dbGet, dbGetAll } = require("../modules/database");
const { classInformation } = require("../modules/class/classroom");
const { settings, logNumbers } = require("../modules/config");
const { logger } = require("../modules/logger");
const { Student } = require("../modules/student");
const { STUDENT_PERMISSIONS, MANAGER_PERMISSIONS, GUEST_PERMISSIONS } = require("../modules/permissions");
const { managerUpdate } = require("../modules/socketUpdates");
const { sendMail, limitStore, RATE_LIMIT } = require("../modules/mail.js");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Regex to test if the password and display name are valid
const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()\-_+=\{\}\[\]<>,.:;'\"~?/\|\\]{5,20}$/;
const displayRegex = /^[a-zA-Z0-9_ ]{5,20}$/;

module.exports = {
    run(app) {
        app.get("/login", async (req, res) => {
            try {
                // If a code is provided, look for the matching token in the database
                const code = req.query.code;
                let token;
                if (code) {
                    token = (await dbGet("SELECT token FROM temp_user_creation_data WHERE secret=?", [code])).token;
                }

                // If the user is already logged in, redirect them to the home page
                if (req.session.email !== undefined && classInformation.users[req.session.email]) {
                    res.redirect("/");
                    return;
                }

                // If the user is not logged in, render the login page
                if (!token) {
                    logger.log("info", `[get /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                    res.render("pages/login", {
                        title: "Login",
                        redirectURL: undefined,
                        googleOauthEnabled: settings.googleOauthEnabled,
                        route: "login",
                    });
                    return;
                } else {
                    // Decode the user account data from the stored token
                    const user = jwt.decode(token);

                    // If the codes don't match, wipe the create data and render a message saying the codes don't match
                    if (code !== user.newSecret) {
                        res.render("pages/message", {
                            message: "Invalid verification code. Please try again.",
                            title: "Error",
                        });
                        return;
                    }

                    try {
                        await dbRun(
                            "INSERT INTO users(email, password, permissions, API, secret, displayName, verified) VALUES(?, ?, ?, ?, ?, ?, ?)",
                            [user.email, user.hashedPassword, user.permissions, user.newAPI, user.newSecret, user.displayName, 1]
                        );
                        logger.log("verbose", "[get /login] Added user to database");

                        // Find the user in which was just created to get the id of the user
                        const userData = await dbGet("SELECT * FROM users WHERE email=?", [user.email]);
                        classInformation.users[userData.email] = new Student(
                            userData.email,
                            userData.id,
                            userData.permissions,
                            userData.API,
                            [],
                            [],
                            userData.tags ? userData.tags.split(",") : [],
                            userData.displayName,
                            false
                        );
                        // Add the user to the session in order to transfer data between each page
                        req.session.userId = userData.id;
                        req.session.email = userData.email;
                        req.session.classId = null;
                        req.session.displayName = userData.displayName;
                        req.session.verified = 1;

                        // Delete any temp user creation data with the same email to prevent multiple accounts with the same email
                        const tempUsers = await dbGetAll("SELECT token FROM temp_user_creation_data");
                        for (const tempUser of tempUsers) {
                            const decoded = jwt.decode(tempUser.token);
                            if (decoded.email === userData.email) {
                                await dbRun("DELETE FROM temp_user_creation_data WHERE token=?", [tempUser.token]);
                            }
                        }

                        logger.log("verbose", `[post /login] session=(${JSON.stringify(req.session)})`);
                        logger.log("verbose", `[post /login] classInformation=(${JSON.stringify(classInformation)})`);

                        managerUpdate();
                        res.redirect("/");
                    } catch (err) {
                        // Handle the same email being used for multiple accounts
                        if (err.code === "SQLITE_CONSTRAINT" && err.message.includes("UNIQUE constraint failed: users.email")) {
                            logger.log("verbose", "[post /login] Email already exists");
                            res.render("pages/login", {
                                title: "Login",
                                redirectURL: undefined,
                                googleOauthEnabled: settings.googleOauthEnabled,
                                route: "login",
                                errorMessage: "A user with that email already exists.",
                            });
                            return;
                        }

                        // Handle other errors
                        logger.log("error", err.stack);
                        res.render("pages/message", {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: "Error",
                        });
                    }
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });

        // This lets the user log into the server, it uses each element from the database to allow the server to do so
        // This lets users actually log in instead of not being able to log in at all
        // It uses the emails, passwords, etc. to verify that it is the user that wants to log in logging in
        // This also hashes passwords to make sure people's accounts don't get hacked
        app.post("/login", async (req, res) => {
            try {
                const user = {
                    password: req.body.password,
                    email: req.body.email,
                    loginType: req.body.loginType,
                    userType: req.body.userType,
                    displayName: req.body.displayName,
                    classID: req.body.classID,
                };
                logger.log("info", `[post /login] ip=(${req.ip}) session=(${JSON.stringify(req.session)}`);
                logger.log(
                    "verbose",
                    `[post /login] email=(${user.email}) password=(${Boolean(user.password)}) loginType=(${user.loginType}) userType=(${user.userType})`
                );

                // Check whether user is logging in or signing up
                if (user.loginType === "login") {
                    logger.log("verbose", "[post /login] User is logging in");

                    // Get the users login in data to verify password
                    database.get(
                        "SELECT users.*, CASE WHEN shared_polls.pollId IS NULL THEN json_array() ELSE json_group_array(DISTINCT shared_polls.pollId) END as sharedPolls, CASE WHEN custom_polls.id IS NULL THEN json_array() ELSE json_group_array(DISTINCT custom_polls.id) END as ownedPolls FROM users LEFT JOIN shared_polls ON shared_polls.userId = users.id LEFT JOIN custom_polls ON custom_polls.owner = users.id WHERE users.email=?",
                        [user.email],
                        async (err, userData) => {
                            try {
                                // Check if a user with that name was not found in the database
                                if (!userData || !userData.email) {
                                    // Check if they're an unverified user in temp_user_creation_data
                                    const tempUsers = await dbGetAll("SELECT * FROM temp_user_creation_data");
                                    let tempUser = null;

                                    for (const temp of tempUsers) {
                                        const decoded = jwt.decode(temp.token);
                                        if (decoded && decoded.email === user.email) {
                                            // Verify password matches
                                            const passwordMatches = await compare(user.password, decoded.hashedPassword);
                                            if (passwordMatches) {
                                                tempUser = { ...decoded, secret: temp.secret };
                                                break;
                                            }
                                        }
                                    }

                                    if (tempUser) {
                                        logger.log("verbose", "[post /login] User exists but is unverified");
                                        res.render("pages/login", {
                                            title: "Verify Email",
                                            redirectURL: undefined,
                                            googleOauthEnabled: settings.googleOauthEnabled,
                                            route: "verify",
                                            email: user.email,
                                            secret: tempUser.secret,
                                        });
                                        return;
                                    }

                                    logger.log("verbose", "[post /login] User does not exist");
                                    res.render("pages/login", {
                                        title: "Login",
                                        redirectURL: undefined,
                                        googleOauthEnabled: settings.googleOauthEnabled,
                                        route: "login",
                                        errorMessage: "No user found with that email.",
                                    });
                                    return;
                                }

                                // Compare password hashes and check if it is correct
                                const passwordMatches = await compare(user.password, userData.password);
                                if (!passwordMatches) {
                                    logger.log("verbose", "[post /login] Incorrect password");
                                    res.render("pages/login", {
                                        title: "Login",
                                        redirectURL: undefined,
                                        googleOauthEnabled: settings.googleOauthEnabled,
                                        route: "login",
                                        errorMessage: "Incorrect Password. Try again.",
                                    });
                                    return;
                                }

                                // If the user does not have a display name, set it to their email
                                if (!userData.displayName) {
                                    (database.run("UPDATE users SET displayName = ? WHERE email = ?", [userData.email, userData.email]),
                                        (err) => {
                                            try {
                                                if (err) throw err;
                                                logger.log("verbose", "[post /login] Added displayName to database");
                                            } catch (err) {
                                                logger.log("error", err.stack);
                                                res.render("pages/message", {
                                                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                                    title: "Error",
                                                });
                                            }
                                        });
                                }

                                let loggedIn = false;
                                let classId = "";
                                for (let classData of Object.values(classInformation.classrooms)) {
                                    if (classData.key) {
                                        for (let email of Object.keys(classData.students)) {
                                            if (email == userData.email) {
                                                loggedIn = true;
                                                classId = classData.id;
                                                break;
                                            }
                                        }
                                    }
                                }

                                if (loggedIn) {
                                    logger.log("verbose", "[post /login] User is already logged in");
                                    req.session.classId = classId;
                                } else {
                                    classInformation.users[userData.email] = new Student(
                                        userData.email,
                                        userData.id,
                                        userData.permissions,
                                        userData.API,
                                        JSON.parse(userData.ownedPolls),
                                        JSON.parse(userData.sharedPolls),
                                        userData.tags ? userData.tags.split(",") : [],
                                        userData.displayName,
                                        false
                                    );

                                    req.session.classId = null;
                                }

                                // Add a cookie to transfer user credentials across site
                                req.session.userId = userData.id;
                                req.session.email = userData.email;
                                req.session.tags = userData.tags ? userData.tags.split(",") : [];
                                req.session.displayName = userData.displayName;
                                req.session.verified = userData.verified;
                                // Log the login post
                                logger.log("verbose", `[post /login] session=(${JSON.stringify(req.session)})`);
                                logger.log("verbose", `[post /login] classInformation=(${JSON.stringify(classInformation)})`);

                                // If the user was logging in from the consent page, redirect them back to the consent page
                                if (req.body.route === "transfer") {
                                    res.redirect(req.body.redirectURL);
                                    return;
                                }

                                // Redirect the user to the home page to be redirected to the correct spot
                                res.redirect("/");
                            } catch (err) {
                                logger.log("error", err.stack);
                                res.render("pages/message", {
                                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                    title: "Error",
                                });
                            }
                        }
                    );
                } else if (user.loginType === "new") {
                    // Check if the password and display name are valid
                    if (!passwordRegex.test(user.password) || !displayRegex.test(user.displayName)) {
                        logger.log("verbose", "[post /login] Invalid data provided to create new user");
                        res.render("pages/login", {
                            title: "Login",
                            redirectURL: undefined,
                            googleOauthEnabled: settings.googleOauthEnabled,
                            route: "login",
                            errorMessage: "Invalid password or display name. Please try again.",
                        });
                        return;
                    }

                    // Trim whitespace from email and set lowercase
                    // After that, set the default user permissions to student
                    user.email = user.email.trim().toLowerCase();
                    let userPermission = STUDENT_PERMISSIONS;

                    logger.log("verbose", "[post /login] Creating new user");

                    // Get all existing users and check for existing emails, APIs, and secrets
                    const users = await dbGetAll("SELECT API, secret, email, displayName FROM users");

                    let existingAPIs = [];
                    let existingSecrets = [];
                    let newAPI;
                    let newSecret;

                    // If there are no users in the database, the first user is a manager
                    if (users.length === 0) {
                        userPermission = MANAGER_PERMISSIONS;
                    }

                    // Check if the email already exists and store existing APIs and secrets
                    for (const dbUser of users) {
                        existingAPIs.push(dbUser.API);
                        existingSecrets.push(dbUser.secret);
                        if (dbUser.email === user.email) {
                            logger.log("verbose", "[post /login] User already exists");
                            res.render("pages/login", {
                                title: "Login",
                                redirectURL: undefined,
                                googleOauthEnabled: settings.googleOauthEnabled,
                                route: "login",
                                errorMessage: "A user with that email already exists.",
                            });
                            return;
                        }
                    }

                    // Generate unique API key
                    do {
                        newAPI = crypto.randomBytes(32).toString("hex");
                    } while (existingAPIs.includes(newAPI));

                    // Generate unique secret key
                    do {
                        newSecret = crypto.randomBytes(256).toString("hex");
                    } while (existingSecrets.includes(newSecret));

                    // Hash the provided password
                    const hashedPassword = await hash(user.password);

                    // If email is not enabled in the settings, create the user immediately without email verification
                    if (!settings.emailEnabled) {
                        user.newAPI = newAPI;
                        user.newSecret = newSecret;
                        user.hashedPassword = hashedPassword;
                        user.permissions = userPermission;
                        database.run(
                            "INSERT INTO users(email, password, permissions, API, secret, displayName, verified) VALUES(?, ?, ?, ?, ?, ?, ?)",
                            [user.email, user.hashedPassword, user.permissions, user.newAPI, user.newSecret, user.displayName, 1],
                            (err) => {
                                try {
                                    if (err) throw err;
                                    logger.log("verbose", "[get /login] Added user to database");
                                    // Find the user in which was just created to get the id of the user
                                    database.get("SELECT * FROM users WHERE email=?", [user.email], (err, userData) => {
                                        try {
                                            if (err) throw err;
                                            classInformation.users[userData.email] = new Student(
                                                userData.email,
                                                userData.id,
                                                userData.permissions,
                                                userData.API,
                                                [],
                                                [],
                                                userData.tags ? userData.tags.split(",") : [],
                                                userData.displayName,
                                                false
                                            );
                                            // Add the user to the session in order to transfer data between each page
                                            req.session.userId = userData.id;
                                            req.session.email = userData.email;
                                            req.session.classId = null;
                                            req.session.displayName = userData.displayName;
                                            req.session.verified = 1;

                                            logger.log("verbose", `[post /login] session=(${JSON.stringify(req.session)})`);
                                            logger.log("verbose", `[post /login] classInformation=(${JSON.stringify(classInformation)})`);

                                            managerUpdate();

                                            res.redirect("/");
                                        } catch (err) {
                                            logger.log("error", err.stack);
                                            res.render("pages/message", {
                                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                                title: "Error",
                                            });
                                        }
                                    });
                                } catch (err) {
                                    // Handle the same email being used for multiple accounts
                                    if (err.code === "SQLITE_CONSTRAINT" && err.message.includes("UNIQUE constraint failed: users.email")) {
                                        logger.log("verbose", "[post /login] Email already exists");
                                        res.render("pages/login", {
                                            title: "Login",
                                            redirectURL: undefined,
                                            googleOauthEnabled: settings.googleOauthEnabled,
                                            route: "login",
                                            errorMessage: "A user with that email already exists.",
                                        });
                                        return;
                                    }

                                    // Handle other errors
                                    logger.log("error", err.stack);
                                    res.render("pages/message", {
                                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                        title: "Error",
                                    });
                                    return;
                                }
                            }
                        );
                        return;
                    }

                    // Set the creation data for the user
                    const accountCreationData = user;
                    accountCreationData.newAPI = newAPI;
                    accountCreationData.newSecret = newSecret;
                    accountCreationData.hashedPassword = hashedPassword;
                    accountCreationData.permissions = userPermission;
                    accountCreationData.password = undefined;

                    // Create JWT token with this information then store it in the temp_user_creation_data in the database
                    // This will be used to finish creating the account once the email is verified
                    const token = jwt.sign(accountCreationData, newSecret, { expiresIn: "1h" });
                    await dbRun("INSERT INTO temp_user_creation_data(token, secret) VALUES(?, ?)", [token, newSecret]);

                    // Get the web address for Formbar to send in the email
                    const location = `${req.protocol}://${req.get("host")}`;

                    // Create the HTML content for the email
                    const html = `
                            <h1>Verify your email</h1>
                            <p>Click the link below to verify your email address with Formbar</p>
                                <a href='${location}/login?code=${newSecret}'>Verify Email</a>
                            `;

                    // Send the email
                    sendMail(user.email, "Formbar Verification", html);
                    if (limitStore.has(user.email) && Date.now() - limitStore.get(user.email) < RATE_LIMIT) {
                        res.render("pages/message", {
                            message: `Email has been rate limited. Please wait ${Math.ceil((limitStore.get(user.email) + RATE_LIMIT - Date.now()) / 1000)} seconds.`,
                            title: "Verification",
                        });
                    } else {
                        res.render("pages/message", {
                            message: "Verification email sent. Please check your email.",
                            title: "Verification",
                        });
                    }
                } else if (user.loginType === "guest") {
                    if (user.displayName.trim() === "") {
                        logger.log("verbose", "[post /login] Invalid display name provided to create guest user");
                        res.render("pages/login", {
                            title: "Login",
                            redirectURL: undefined,
                            googleOauthEnabled: settings.googleOauthEnabled,
                            route: "login",
                            errorMessage: "Invalid Display Name.",
                        });
                        return;
                    }
                    logger.log("verbose", "[post /login] Logging in as guest");

                    // Create a temporary guest user
                    const email = "guest" + crypto.randomBytes(4).toString("hex");
                    const student = new Student(
                        email, // email
                        `guest_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`, // Unique ID for guest
                        GUEST_PERMISSIONS,
                        null, // API key
                        [], // Owned polls
                        [], // Shared polls
                        [], // Tags
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
                    res.redirect("/");
                }
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });

        // Resend verification email
        app.post("/resend-verification", async (req, res) => {
            try {
                const { email, secret } = req.body;
                logger.log("info", `[post /resend-verification] ip=(${req.ip}) email=(${email})`);

                // Check rate limit
                if (limitStore.has(email) && Date.now() - limitStore.get(email) < RATE_LIMIT) {
                    const waitTime = Math.ceil((limitStore.get(email) + RATE_LIMIT - Date.now()) / 1000);
                    res.status(429).json({
                        error: `Please wait ${waitTime} seconds before resending.`,
                        waitTime,
                    });
                    return;
                }

                // Verify the secret matches
                const tempUser = await dbGet("SELECT * FROM temp_user_creation_data WHERE secret=?", [secret]);
                if (!tempUser) {
                    res.status(404).json({ error: "Verification request not found or expired." });
                    return;
                }

                //
                const decoded = jwt.decode(tempUser.token);
                if (decoded.email !== email) {
                    res.status(400).json({ error: "Invalid request." });
                    return;
                }

                // Get the web address for Formbar to send in the email and create the HTML content for the email
                const location = `${req.protocol}://${req.get("host")}`;
                const html = `
                <h1>Verify your email</h1>
                <p>Click the link below to verify your email address with Formbar</p>
                    <a href='${location}/login?code=${secret}'>Verify Email</a>
                `;

                // Send the email
                sendMail(email, "Formbar Verification", html);
                res.status(200).json({ message: "Verification email sent successfully." });
            } catch (err) {
                logger.log("error", err.stack);
                res.status(500).json({ error: "There was an error sending the email." });
            }
        });
    },
};
