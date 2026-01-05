const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const { dbGetAll } = require("./database");

// Create the express server and attach socket.io to it
function createServer() {
    const app = express();
    const http = require("http").createServer(app);
    const io = require("socket.io")(http);
    const swaggerDocOptions = {
        definition: {
            openapi: "3.0.0",
            info: {
                title: "Formbar API",
                version: "3.0.0",
                description: "HTTP API documentation for Formbar.js.",
            },
        },
        apis: ["./api/v1/**/*.js", "./docs/components/**/*.yaml"],
    };

    const specs = swaggerJsdoc(swaggerDocOptions);
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));

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
