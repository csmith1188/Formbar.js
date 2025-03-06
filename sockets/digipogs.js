const { transferDigipogs } = require('../modules/digipogs');

module.exports = {
    run(socket) {
        try {
            socket.on('awardDigipogs', (data) => transferDigipogs(data.from, data.to, data.amount, data.app, data.reason));       
        } catch (err) {
            console.error(err);
        };
    }
};
    