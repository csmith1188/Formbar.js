const { transferDigipogs } = require('../modules/digipogs');

module.exports = {
    run(socket) {
        try {
            socket.on('awardDigipogs', (data) => transferDigipogs(data.from, data.to, data.amount, data.app, data.reason));   
                
            socket.on('requestConversion', (data) => {
                // Get the class id and username from the session
                // Check if the class is inactive before continuing
                const classId = socket.request.session.classId;
                const username = socket.request.session.username;
                if (!classInformation.classrooms[classId].isActive) {
                    socket.emit('message', 'This class is not currently active.');
                    return;
                }
                const student = classInformation.classrooms[classId].students[username];
                student.requestConversion = data || 100;
                

            });
        } catch (err) {
            console.error(err);
        };
    }
};
    