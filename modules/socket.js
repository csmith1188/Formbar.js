let io = null; // This is a hacky workaround to make io available everywhere. createSocketServer MUST be called before use.
function createSocketServer(http) {
    io = require('socket.io')(http);
    return io;
}

module.exports = {
    createSocketServer,
    io
}