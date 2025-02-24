const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('newTag', (tagName) => {
            // Add a new tag to the database
            try {
                if (tagName == '') return;
                classInformation.classrooms[socket.request.session.classId].tagNames.push(tagName);

                let newTotalTags = "";
                for (let i = 0; i < classInformation.classrooms[socket.request.session.classId].tagNames.length; i++) {
                    newTotalTags += classInformation.classrooms[socket.request.session.classId].tagNames[i] + ", ";
                };
                
                newTotalTags = newTotalTags.split(", ");
                newTotalTags.pop();
                database.get('SELECT * FROM classroom WHERE name = ?', [classInformation.classrooms[socket.request.session.classId].className], (err, row) => {
                    if (err) {
                        logger.log(err.stack);
                    }
                    if (row) {
                        database.run('UPDATE classroom SET tags = ? WHERE name = ?', [newTotalTags.toString(), classInformation.classrooms[socket.request.session.classId].className], (err) => {
                            if (err) {
                                logger.log(err.stack);
                            } else {
                                socket.emit('reload');
                            }
                        });
                    } else {
                        socket.send('message', 'Class not found')
                    };
                });
            }
            catch (err) {
                logger.log('error', err.stack);
            }
        })

        socket.on('removeTag', (tagName) => {
            try {
                // Find the tagName in the array of tagnames from the database
                // If the tagname is not there, socket.send('message', 'Tag not found') and return
                // If the tagname is there, remove it from the array and update the database
                const index = classInformation.classrooms[socket.request.session.classId].tagNames.indexOf(tagName);
                if (index > -1) {
                    classInformation.classrooms[socket.request.session.classId].tagNames.splice(index, 1);
                } else {
                    socket.send('message', 'Tag not found')
                    return;
                }

                // Now remove all instances of the tag from the students' tags
                for (const student of Object.values(classInformation.classrooms[socket.request.session.classId].students)) {
                    if (student.classPermissions == 0 || student.classPermissions >= 5) continue;
                
                    let studentTags = student.tags.split(",");
                    let studentIndex = studentTags.indexOf(tagName);
                    if (studentIndex > -1) {
                        studentTags.splice(studentIndex, 1);
                    }

                    student.tags = studentTags.toString();
                    database.get('SELECT * FROM users WHERE username = ?', [student.username], (err, row) => {
                        if (err) {
                            logger.log(err.stack);
                        }
                        if (row) {
                            database.run('UPDATE users SET tags = ? WHERE username = ?', [studentTags.toString(), student.username], (err) => {
                                if (err) {
                                    logger.log(err.stack);
                                } else {
                                    socket.emit('reload');
                                }
                            });
                        } else {
                            socket.send('message', 'User not found')
                        };
                    });

                    database.get('SELECT tags FROM classroom WHERE name = ?', [classInformation.classrooms[socket.request.session.classId].className], (err, row) => {
                        if (err) {
                            logger.log(err.stack);
                        }

                        // Set the tags in the database to a variable
                        // Remove the tag from the variable
                        // Update the database with the new variable
                        if (row) {
                            let newTotalTags = row.tags;
                            newTotalTags = newTotalTags.split(",");
                            
                            const tagIndex = newTotalTags.indexOf(tagName);
                            if (tagIndex > -1) {
                                newTotalTags.splice(tagIndex, 1);
                            }
                            
                            database.run('UPDATE classroom SET tags = ? WHERE name = ?', [newTotalTags.toString(), classInformation.classrooms[socket.request.session.classId].className], (err) => {
                                if (err) {
                                    logger.log(err.stack);
                                } else {
                                    socket.emit('reload');
                                }
                            });
                        } else {
                            socket.send('message', 'Class not found')
                        };
                    })
                };
            }
            catch (err) {
                logger.log('error', err.stack);
            }
        });

        socket.on('saveTags', (studentId, tags, username) => {
            // Save the tags to the students tag element in their object
            // Then save their tags to the database
            try {
                logger.log('info', `[saveTags] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[saveTags] studentId=(${studentId}) tags=(${JSON.stringify(tags)})`)

                // If the student has the offline tag while they are active in the class, remove it
                // If the student is not active in the class, add the offline tag
                if (classInformation.users[username].activeClasses.includes(socket.request.session.classId)) {
                    tags = tags.filter(tag => tag !== 'Offline');
                } else if (!tags.includes('Offline')) {
                    tags.push('Offline');
                }

                classInformation.classrooms[socket.request.session.classId].students[username].tags = tags.toString()
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
                                return
                            } else {
                                socket.emit('reload')
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