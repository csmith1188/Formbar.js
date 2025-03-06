const { transferDigipogs } = require('../modules/digipogs');
const { classInformation } = require('../modules/class');
const { database } = require('../modules/database');

module.exports = {
    run(socket, socketUpdates) {
        try {
            socket.on('awardDigipogs', (data) => transferDigipogs(data.from, data.to, data.amount, data.app, data.reason));   
                
            socket.on('requestConversion', async (data) => {
                // Get the class id and username from the session
                // Check if the class is inactive before continuing
                const classId = socket.request.session.classId;
                const username = socket.request.session.username;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }
                const student = classInformation.classrooms[classId].students[username];
                const digipogs = await new Promise((resolve, reject) => {
                    database.get('SELECT digipogs FROM users WHERE username = ?', [username], (err, row) => {
                        if (err) reject(err);
                        resolve(row.digipogs);
                    });
                });
                data *= 100;
                if (data > digipogs) {
                    socket.emit('message', 'You do not have enough digipogs to convert.');
                    return;
                };
                student.requestConversion = data || 100;
                socketUpdates.classPermissionUpdate();
            });
        } catch (err) {
            console.error(err);
        };
    }
};
    