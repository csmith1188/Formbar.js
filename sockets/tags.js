const { classInformation } = require("../modules/class/classroom")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('setTags', (tags) => {
            // Set the tags for the class
            try {
                // Make sure the offline tag is always present
                if (!tags.includes("Offline")) {
                    tags.push("Offline")
                }

                // Save the tags to the class object
                tags = tags.sort();
                classInformation.classrooms[socket.request.session.classId].tags = tags;

                // Now remove all instances of the tag from the students' tags
                for (const student of Object.values(classInformation.classrooms[socket.request.session.classId].students)) {
                    if (student.classPermissions == 0 || student.classPermissions >= 5) continue;
                    if (!student.tags) student.tags = "";

                    let studentTags = student.tags.split(",");
                    for (let i = 0; i < studentTags.length; i++) {
                        if (!tags.includes(studentTags[i])) {
                            studentTags.splice(i, 1);
                        }
                    }
                    student.tags = studentTags.toString();
                    database.get('SELECT * FROM users WHERE email = ?', [student.email], (err, row) => {
                        if (err) {
                            logger.log(err.stack);
                        }
                        if (row) {
                            database.run('UPDATE users SET tags = ? WHERE email = ?', [studentTags.toString(), student.email], (err) => {
                                if (err) {
                                    logger.log(err.stack);
                                }
                            });
                        } else {
                            socket.send('message', 'User not found')
                        };
                    });
                }

                database.get('SELECT * FROM classroom WHERE name = ?', [classInformation.classrooms[socket.request.session.classId].className], (err, row) => {
                    if (err) {
                        logger.log(err.stack);
                    }

                    if (row) {
                        database.run('UPDATE classroom SET tags = ? WHERE name = ?', [tags.toString(), classInformation.classrooms[socket.request.session.classId].className], (err) => {
                            if (err) {
                                logger.log(err.stack);
                            }
                        });
                    } else {
                        socket.send('message', 'Class not found')
                    }
                });
            }
            catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on('saveTags', (studentId, tags, email) => {
            // Save the tags to the students tag element in their object
            // Then save their tags to the database
            try {
                logger.log('info', `[saveTags] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[saveTags] studentId=(${studentId}) tags=(${JSON.stringify(tags)})`)

                // If the student has the offline tag while they are active in the class, remove it
                // If the student is not active in the class, add the offline tag
                if (classInformation.users[email].activeClass === socket.request.session.classId) {
                    for (tag of tags) {
                        if (tag == 'Offline' || tag == '') {
                            tags.splice(tags.indexOf(tag), 1);
                        }
                    }
                } else if (!tags.includes('Offline')) {
                    tags.push('Offline');
                }

                classInformation.classrooms[socket.request.session.classId].students[email].tags = tags.toString()
                database.get('SELECT tags FROM users WHERE id=?', [studentId], (err, row) => {
                    if (err) {
                        logger.log('error', err)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }
                    if (row) {
                        // Row exists, update it
                        database.run('UPDATE users SET tags=? WHERE id=?', [tags.toString(), studentId], (err) => {
                            if (err) {
                                logger.log('error', err)
                                socket.emit('message', 'There was a server error try again.')
                            }
                        });
                    } else {
                        socket.send('message', 'User not found')
                    }
                });
            }
            catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}