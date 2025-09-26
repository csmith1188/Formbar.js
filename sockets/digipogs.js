const jwt = require("jsonwebtoken");
const { privateKey } = require("../modules/config");
const { awardDigipogs, transferDigipogs } = require("../modules/digipogs");

function jwtSign(payload) {
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' }, { expiresIn: '1h' });
}

module.exports = {
    run(socket) {
        // For those with teacher permissions or higher to add digipogs to a user's account
        socket.on('awardDigipogs', async (awardData) => {
            const result = await awardDigipogs(awardData);
            socket.emit('awardDigipogsResponse', result);
        });

        // For transferring digipogs between users for third party services
        socket.on('transferDigipogs', async (transferData) => {
            const result = await transferDigipogs(transferData);
            socket.emit('transferResponse', jwtSign(result));
        });
    },
    jwtSign
}