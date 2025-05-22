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
	const ipList = await dbGetAll(`SELECT id, ip FROM ip_${type}`)
	return ipList.reduce((ips, ip) => {
		ips[ip.id] = ip
		return ips
	}, {})
}

function createSocketFromHttp(req, res) {
	return {
		request: {
			session: req.session.user
		},
		handshake: {
			address: req.ip
		},
		emit: (event, message) => {
			res.send(message);
		},

		// Store the original request and response
		// These can only be used if isEmulatedSocket is true
		req: req,
		res: res,

		// Used for indicating that this is not a real socket
		isEmulatedSocket: true
	}
}

const { app, io, http } = createServer();
module.exports = {
	app,
	io,
	http,
	getIpAccess,
	createSocketFromHttp
};