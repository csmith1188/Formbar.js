const express = require("express");

// Create the express server and attach socket.io to it
function createServer() {
    const app = express();
    const http = require("http").createServer(app);
    const io = require("socket.io")(http);

    return { app, io, http };
}

const { app, io, http } = createServer();
module.exports = { app, io, http };