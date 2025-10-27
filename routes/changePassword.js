const { logger } = require("../modules/logger");
const { sendMail } = require("../modules/mail.js");
const { database } = require("../modules/database.js");
const { hash } = require("../modules/crypto.js");
const { logNumbers } = require("../modules/config.js");
const { dbRun, dbGet } = require("../modules/database");

module.exports = {
    run(app) {
        app.get("/changepassword", async (req, res) => {
            try {
                // If there is no token, render the normal change password page
                const code = req.query.code;
                if (code === undefined || code === null) {
                    res.render("pages/changepassword", {
                        sent: false,
                        title: "Change Password",
                    });
                    return;
                }

                // Set session email so that it can be used when changing the password
                // After that, get their token from the database
                req.session.email = req.query.email;
                const userData = await dbGet("SELECT secret FROM users WHERE email = ?", [req.session.email]);
                let token;
                if (userData) {
                    token = userData.secret;
                }

                // If the token is valid, render the page to let the user reset their password
                // If not, render an error message
                if (code === token) {
                    res.render("pages/changepassword", {
                        sent: true,
                        title: "Change Password",
                    });
                } else {
                    res.render("pages/message", {
                        message: "Invalid code",
                        title: "Error",
                    });
                }
            } catch (err) {
                logger.log("error", err.stack);
            }
        });

        app.post("/changepassword", async (req, res) => {
            try {
                const userData = await dbGet("SELECT secret FROM users WHERE email = ?", [req.session.email || req.body.email]);
                if (!userData) {
                    return res.render("pages/message", {
                        message: "No user found with that email.",
                        title: "Error",
                    });
                }

                let token = userData.secret;
                if (req.body.email) {
                    // Send an email to the user with the password change link
                    const location = `${req.protocol}://${req.get("host")}`;
                    sendMail(
                        req.body.email,
                        "Formbar Password Change",
                        `
                        <h1>Change your password</h1>
                        <p>Click the link below to change your password</p>
                        <a href='${location}/changepassword?code=${token}&email=${req.body.email}'>Change Password</a>
                    `
                    );
                    res.redirect("/");
                } else if (req.body.newPassword !== req.body.confirmPassword) {
                    // If the passwords do not match, tell the user
                    res.render("pages/message", {
                        message: "Passwords do not match",
                        title: "Error",
                    });
                } else if (req.session.email) {
                    // If the email is in the session, change the password
                    const hashedPassword = await hash(req.body.newPassword);
                    await dbRun("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, req.session.email]);
                    console.log(`[${req.session.email}]: Password changed`);
                    res.redirect("/");
                }
            } catch (err) {
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
                logger.log("error", err.stack);
            }
        });
    },
};
