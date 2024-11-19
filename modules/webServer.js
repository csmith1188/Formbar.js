const express = require("express");
const { getAll } = require("./database");

// Create the express server and attach socket.io to it
function createServer() {
    const app = express();
    const http = require("http").createServer(app);
    const io = require("socket.io")(http);

    return { app, io, http };
}

async function getIpAccess(type) {
	const ipList = await getAll(`SELECT id, ip FROM ip_${type}`)
	return ipList.reduce((ips, ip) => {
		ips[ip.id] = ip
		return ips
	}, {})
}

const { app, io, http } = createServer();
module.exports = { app, io, http, getIpAccess };