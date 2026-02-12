const { hash, compare } = require("../modules/crypto");
const { database, dbRun, dbGet, dbGetAll } = require("../modules/database");
const { classInformation } = require("../modules/class/classroom");
const { settings, logNumbers } = require("../modules/config");
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
                if (req.user.email !== undefined && classInformation.users[req.user.email]) {
                    res.redirect("/");
                    return;
                }

                // If the user is not logged in, render the login page
                if (!token) {
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
                        // Hash the API key before storing (but NOT the secret - it's needed for password resets)
                        const hashedAPI = await hash(user.newAPI);

                        await dbRun(
                            "INSERT INTO users(email, password, permissions, API, secret, displayName, verified) VALUES(?, ?, ?, ?, ?, ?, ?)",
                            [user.email, user.hashedPassword, user.permissions, hashedAPI, user.newSecret, user.displayName, 1]
                        );

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
                        req.user.id = userData.id;
                        req.user.email = userData.email;
                        req.user.classId = null;
                        req.user.displayName = userData.displayName;
                        req.user.verified = 1;

                        // Delete any temp user creation data with the same email to prevent multiple accounts with the same email
                        const tempUsers = await dbGetAll("SELECT token FROM temp_user_creation_data");
                        for (const tempUser of tempUsers) {
                            const decoded = jwt.decode(tempUser.token);
                            if (decoded && decoded.email && decoded.email.toLowerCase().trim() === userData.email) {
                                await dbRun("DELETE FROM temp_user_creation_data WHERE token=?", [tempUser.token]);
                            }
                        }

                        managerUpdate();
                        res.redirect("/");
                    } catch (err) {
                        // Handle the same email being used for multiple accounts
                        if (err.code === "SQLITE_CONSTRAINT" && err.message.includes("UNIQUE constraint failed: users.email")) {
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
                        res.render("pages/message", {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: "Error",
                        });
                    }
                }
            } catch (err) {
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
                // Trim whitespace from email and set lowercase
                user.email = user.email.trim().toLowerCase();

                // Check whether user is logging in or signing up
                if (user.loginType === "login") {

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
                                        if (
                                            decoded &&
                                            decoded.email.toLowerCase().trim() === user.email &&
                                            typeof decoded.hashedPassword === "string" &&
                                            decoded.hashedPassword.length > 0
                                        ) {
                                            // Verify password matches
                                            const passwordMatches = await compare(user.password, decoded.hashedPassword);
                                            if (passwordMatches) {
                                                tempUser = { ...decoded, secret: temp.secret };
                                                break;
                                            }
                                        }
                                    }

                                    if (tempUser) {
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
                                    res.render("pages/login", {
                                        title: "Login",
                                        redirectURL: undefined,
                                        googleOauthEnabled: settings.googleOauthEnabled,
                                        route: "login",
                                        errorMessage: "No user found with that email.",
                                    });
                                    return;
                                }

                                // Check if the user has a password set
                                if (!userData.password) {
                                    res.render("pages/login", {
                                        title: "Login",
                                        redirectURL: undefined,
                                        googleOauthEnabled: settings.googleOauthEnabled,
                                        route: "login",
                                        errorMessage: "This account does not have a password set.",
                                    });
                                    return;
                                }

                                // Compare password hashes and check if it is correct
                                const passwordMatches = await compare(user.password, userData.password);
                                if (!passwordMatches) {
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
                                            } catch (err) {
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
                                    req.user.classId = classId;
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

                                    req.user.classId = null;
                                }

                                // Add a cookie to transfer user credentials across site
                                req.user.id = userData.id;
                                req.user.email = userData.email;
                                req.user.tags = userData.tags ? userData.tags.split(",") : [];
                                req.user.displayName = userData.displayName;
                                req.user.verified = userData.verified;
                                // Log the login post

                                // If the user was logging in from the consent page, redirect them back to the consent page
                                if (req.body.route === "transfer") {
                                    res.redirect(req.body.redirectURL);
                                    return;
                                }

                                // Redirect the user to the home page to be redirected to the correct spot
                                res.redirect("/");
                            } catch (err) {
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

                    // Get all existing users and check for existing emails
                    const users = await dbGetAll("SELECT email, displayName FROM users");

                    // If there are no users in the database, the first user is a manager
                    if (users.length === 0) {
                        userPermission = MANAGER_PERMISSIONS;
                    }

                    // Check if the email or display name already exists
                    for (const dbUser of users) {
                        if (dbUser.email === user.email) {
                            res.render("pages/message", {
                                message: "A user with that email already exists.",
                                title: "Login",
                                redirectURL: undefined,
                                googleOauthEnabled: settings.googleOauthEnabled,
                                route: "login",
                                errorMessage: "A user with that email already exists.",
                            });
                            return;
                        }

                        // Check if the display name already exists in the database
                        if (dbUser.displayName.toLowerCase() === user.displayName.toLowerCase()) {
                            res.render("pages/message", {
                                message: "A user with that display name already exists.",
                                title: "Login",
                            });
                            return;
                        }
                    }

                    // Generate API key and secret
                    const newAPI = crypto.randomBytes(32).toString("hex");
                    const newSecret = crypto.randomBytes(256).toString("hex");

                    // Hash the provided password
                    const hashedPassword = await hash(user.password);

                    // If email is not enabled in the settings, create the user immediately without email verification
                    if (!settings.emailEnabled) {
                        // Hash the API key before storing
                        const hashedAPI = await hash(newAPI);

                        user.newAPI = hashedAPI;
                        user.newSecret = newSecret;
                        user.hashedPassword = hashedPassword;
                        user.permissions = userPermission;
                        database.run(
                            "INSERT INTO users(email, password, permissions, API, secret, displayName, verified) VALUES(?, ?, ?, ?, ?, ?, ?)",
                            [user.email, user.hashedPassword, user.permissions, user.newAPI, user.newSecret, user.displayName, 1],
                            (err) => {
                                try {
                                    if (err) throw err;
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
                                            req.user.id = userData.id;
                                            req.user.email = userData.email;
                                            req.user.classId = null;
                                            req.user.displayName = userData.displayName;
                                            req.user.verified = 1;

                                            managerUpdate();

                                            res.redirect("/");
                                        } catch (err) {
                                            res.render("pages/message", {
                                                message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                                                title: "Error",
                                            });
                                        }
                                    });
                                } catch (err) {
                                    // Handle the same email being used for multiple accounts
                                    if (err.code === "SQLITE_CONSTRAINT" && err.message.includes("UNIQUE constraint failed: users.email")) {
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
                        res.render("pages/login", {
                            title: "Login",
                            redirectURL: undefined,
                            googleOauthEnabled: settings.googleOauthEnabled,
                            route: "login",
                            errorMessage: "Invalid Display Name.",
                        });
                        return;
                    }

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
                    req.user.classId = null;

                    // Add a cookie to transfer user credentials across site
                    req.user.id = student.id;
                    req.user.email = student.email;
                    req.user.tags = student.tags;
                    req.user.displayName = student.displayName;
                    req.user.verified = student.verified;
                    res.redirect("/");
                }
            } catch (err) {
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
                res.status(500).json({ error: "There was an error sending the email." });
            }
        });
    },
};






