const { isAuthenticated, permCheck } = require("@modules/middleware/authentication");
const { classInformation } = require("@modules/class/classroom");
const { logNumbers } = require("@modules/config");
const { database, dbGetAll } = require("@modules/database");
const { joinRoomByCode } = require("@modules/joinRoom");
const { logger } = require("@modules/logger");
const { setClassOfApiSockets, userSockets, emitToUser } = require("@modules/socketUpdates");

module.exports = {
    run(app) {
        app.get("/selectClass", isAuthenticated, permCheck, async (req, res) => {
            try {
                logger.log("info", `[get /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);

                // Get all classes the user is in then render the select class page
                let joinedClasses = await dbGetAll(
                    "SELECT classroom.name, classroom.id, classUsers.permissions FROM users JOIN classusers ON users.id = classusers.studentId JOIN classroom ON classusers.classId = classroom.id WHERE users.email=?",
                    [req.session.email]
                );
                joinedClasses = joinedClasses.filter((classroom) => classroom.permissions !== 0);
                res.render("pages/classes", {
                    title: "Select Class",
                    joinedClasses: joinedClasses,
                });
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });

        // Adds user to a selected class, typically from the select class page
        app.post("/selectClass", isAuthenticated, permCheck, async (req, res) => {
            try {
                let classId = req.body.id;
                let classCode = req.body.key;

                if (!classCode) {
                    // Check if the user is in the class with the class id provided
                    const userInClass = await new Promise((resolve, reject) => {
                        database.get(
                            "SELECT * FROM users JOIN classusers ON users.id = classusers.studentId WHERE users.email=? AND classusers.classId=?",
                            [req.session.email, classId],
                            (err, user) => {
                                try {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }

                                    if (!user) {
                                        resolve(false);
                                        return;
                                    }

                                    resolve(true);
                                } catch (err) {
                                    reject(err);
                                }
                            }
                        );
                    });

                    // Refuse access if the user is not in the class
                    if (!userInClass) {
                        res.render("pages/message", {
                            message: `Error: You are not in that class.`,
                            title: "Error",
                        });
                        return;
                    }

                    // Retrieve the class code associated with the class id if the access code is not provided
                    classCode = await new Promise((resolve, reject) => {
                        database.get("SELECT key FROM classroom WHERE id=?", [classId], (err, classroom) => {
                            try {
                                if (err) {
                                    reject(err);
                                    return;
                                }

                                if (!classroom) {
                                    resolve(null);
                                    return;
                                }

                                resolve(classroom.key);
                            } catch (err) {
                                reject(err);
                            }
                        });
                    });
                }

                logger.log("info", `[post /selectClass] ip=(${req.ip}) session=(${JSON.stringify(req.session)}) classCode=(${classId})`);

                const classJoinStatus = await joinRoomByCode(classCode, req.session);
                if (typeof classJoinStatus == "string") {
                    res.render("pages/message", {
                        message: `Error: ${classJoinStatus}`,
                        title: "Error",
                    });
                    return;
                }

                // If class code is provided, get classId
                if (classCode) {
                    classCode = classCode.toLowerCase();

                    classId = await new Promise((resolve, reject) => {
                        database.get("SELECT id FROM classroom WHERE key=?", [classCode], (err, classroom) => {
                            try {
                                if (err) {
                                    reject(err);
                                    return;
                                }

                                if (!classroom) {
                                    resolve(null);
                                    return;
                                }

                                resolve(classroom.id);
                            } catch (err) {
                                reject(err);
                            }
                        });
                    });
                    req.session.classId = classId;
                }

                // userSocketUpdates[req.session.email].classUpdate();
                setClassOfApiSockets(classInformation.users[req.session.email].API, classId);
                if (userSockets[req.session.email] && Object.keys(userSockets[req.session.email]).length > 0) {
                    emitToUser(req.session.email, "reload");
                }
                res.redirect("/");
            } catch (err) {
                logger.log("error", err.stack);
                res.render("pages/message", {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: "Error",
                });
            }
        });
    },
};
