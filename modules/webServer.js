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
            tags: [
                { name: "Authentication", description: "User authentication and registration", "x-order": 1 },
                { name: "System", description: "System utilities and certificates", "x-order": 2 },
                { name: "Users", description: "User management and profile operations", "x-order": 3 },
                { name: "Class", description: "Class creation and basic operations", "x-order": 4 },
                { name: "Class - Polls", description: "Polling system within classes", "x-order": 5 },
                { name: "Class - Breaks", description: "Break request system", "x-order": 6 },
                { name: "Class - Help", description: "Help ticket system", "x-order": 7 },
                { name: "Room", description: "Room joining and configuration", "x-order": 8 },
                { name: "Room - Links", description: "Link management for rooms", "x-order": 9 },
                { name: "Digipogs", description: "Virtual currency management", "x-order": 10 },
                { name: "IP Management", description: "IP whitelist/blacklist management", "x-order": 11 },
                { name: "Manager", description: "Manager/admin functions", "x-order": 12 },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                        description: "JWT authentication token obtained from /api/v1/auth/login",
                    },
                    sessionAuth: {
                        type: "apiKey",
                        in: "cookie",
                        name: "connect.sid",
                        description: "Session-based authentication cookie",
                    },
                },
            },
        },
        apis: ["./api/v1/**/*.js", "./docs/components/**/*.yaml"],
    };

    const specs = swaggerJsdoc(swaggerDocOptions);
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));

    // Custom CSS for better dark mode readability
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
