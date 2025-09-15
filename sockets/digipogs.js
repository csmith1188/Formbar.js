const { transferDigipogs } = require('../modules/digipogs');
const { classInformation } = require('../modules/class/classroom');
const { database } = require('../modules/database');
const { logger } = require("../modules/logger");

module.exports = {
    run(socket, socketUpdates) {
        try {
            socket.on('awardDigipogs', (data) => {
                try {
                    transferDigipogs(data.from, data.to, data.amount, data.app, data.reason)
                } catch (err) {
                    logger.log('error', err.stack)
                }
            });
                
            socket.on('requestConversion', async (data) => {
                // Get the class id and email from the session
                // Check if the class is inactive before continuing
                const classId = socket.request.session.classId;
                const email = socket.request.session.email;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }
                const student = classInformation.classrooms[classId].students[email];
                const digipogs = await new Promise((resolve, reject) => {
                    database.get('SELECT digipogs FROM users WHERE email = ?', [email], (err, row) => {
                        if (err) reject(err);
                        resolve(row.digipogs);
                    });
                });
                if (+data === NaN || +data <= 0) data = 1;
                data *= 100;
                if (data > digipogs) {
                    socket.emit('message', 'You do not have enough digipogs to convert.');
                    return;
                };
                student.requestConversion = data;
                socketUpdates.classUpdate();
            });
        } catch (err) {
            logger.log('error', err.stack)
        }

        socket.on('convertDigipogs', async (data) => {
            try {
                // Get the class id and email from the session
                // Check if the class is inactive before continuing
                const classId = socket.request.session.classId;
                const email = socket.request.session.email;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }
                const student = classInformation.classrooms[classId].students[email];
                data = +data;
                database.run('UPDATE users SET digipogs = digipogs - ? WHERE email = ?', [data, socket.request.session.email], (err) => {
                    if (err) throw err;
                });
                student.requestConversion = null;
                socketUpdates.classUpdate();
            } catch (err) {
                logger.log('error', err.stack)
            }
        });
    }
};
    