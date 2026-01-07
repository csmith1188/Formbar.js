const express = require("express");
const { dbGetAll } = require("./database");

// Create the express server and attach socket.io to it
function createServer() {
    const app = express();
    const http = require("http").createServer(app);
    const io = require("socket.io")(http);

    return { app, io, http };
}

async function getIpAccess(type) {
    const isWhitelist = type === "whitelist" ? 1 : 0;
    const ipList = await dbGetAll(`SELECT id, ip FROM ip_access_list WHERE is_whitelist = ?`, [isWhitelist]);
    return ipList.reduce((ips, ip) => {
        ips[ip.id] = ip;
        return ips;
    }, {});
}

const { app, io, http } = createServer();
module.exports = {
    app,
    io,
    http,
    getIpAccess,
};
