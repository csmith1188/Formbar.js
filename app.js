// Imported modules
require("module-alias/register");
const express = require("express");
const session = require("express-session"); // For storing client login data
const crypto = require("crypto");
const fs = require("fs");
require("dotenv").config(); // For environment variables

// If the database does not exist, then prompt the user to initialize it and exit
if (!fs.existsSync("database/database.db")) {
    console.log('The database file does not exist. Please run "npm run init-db" to initialize the database.');
    return;
}

// Custom modules
const { logger } = require("./modules/logger.js");
const { classInformation } = require("./modules/class/classroom.js");
const { initSocketRoutes } = require("./sockets/init.js");
const { app, io, http, getIpAccess } = require("./modules/webServer.js");
const { settings } = require("./modules/config.js");
const { lastActivities, INACTIVITY_LIMIT } = require("./sockets/middleware/inactivity");

const { logout } = require("./modules/user/userSession");
const { passport } = require("./modules/googleOauth.js");

// Create session for user information to be transferred from page to page
const sessionMiddleware = session({
    secret: crypto.randomBytes(256).toString("hex"), // Used to sign into the session via cookies
    resave: false, // Used to prevent resaving back to the session store, even if it wasn't modified
    saveUninitialized: false, // Forces a session that is new, but not modified, or 'uninitialized' to be saved to the session store
});

const errorHandlerMiddleware = require("@modules/middleware/error-handler");

// Connect session middleware to express
app.use(sessionMiddleware);

// Initialize passport for Google OAuth
app.use(passport.initialize());
app.use(passport.session());

// For further uses on this use this link: https://socket.io/how-to/use-with-express-session
// Uses a middleware function to successfully transmit data between the user and server
// adds session middle ware to socket.io
io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Block socket connections from banned IPs
io.use((socket, next) => {
    try {
        let ip = socket.handshake.address;
        if (ip && ip.startsWith("::ffff:")) ip = ip.slice(7);

        // @TODO fix
        // if (authentication.checkIPBanned(ip)) {
        //     return next(new Error("IP banned"));
        // }
        next();
    } catch (err) {
        next(err);
    }
});

// Allows express to parse requests
const cors = require("cors");
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
    : [];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no Origin header (e.g., mobile apps, curl)
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Begin checking for any users who have not performed any actions for a specified amount of time
const INACTIVITY_CHECK_TIME = 60000; // 1 Minute
setInterval(() => {
    const currentTime = Date.now();
    for (const email of Object.keys(lastActivities)) {
        const userSockets = lastActivities[email];
        for (const [socketId, activity] of Object.entries(userSockets)) {
            if (currentTime - activity.time > INACTIVITY_LIMIT) {
                // Check if this is an API socket - API sockets should not timeout
                let isApiSocket = false;
                if (activity.socket && activity.socket.rooms) {
                    for (const room of activity.socket.rooms) {
                        if (room.startsWith("api-")) {
                            isApiSocket = true;
                            break;
                        }
                    }
                }

                // Only logout non-API sockets
                if (!isApiSocket) {
                    logout(activity.socket); // Log the user out
                    delete lastActivities[email]; // Remove the user from the inactivity check
                }
            }
        }
    }
}, INACTIVITY_CHECK_TIME);

// @TODO fix
// const REFRESH_TOKEN_CHECK_TIME = 1000 * 60 * 60; // 1 hour
// authentication.cleanRefreshTokens();
// setInterval(async () => {
//     authentication.cleanRefreshTokens();
// }, REFRESH_TOKEN_CHECK_TIME);

// Check if an IP is banned
app.use((req, res, next) => {
    let ip = req.ip;
    if (!ip) return next();
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);

    // @TODO: fix
    // Check if the user is ip banned
    // If the user is not ip banned and is on the ip-banned page, redirect them to the home page
    // const isIPBanned = authentication.checkIPBanned(ip);
    if (req.path === "/ip-banned" && isIPBanned) {
        return next();
    } else if (req.path === "/ip-banned" && !isIPBanned) {
        return res.redirect("/");
    }

    // Redirect to the IP banned page if they are banned
    // if (isIPBanned) {
    //     return res.redirect("/ip-banned");
    // }

    next();
});

// Add currentUser and permission constants to all pages
app.use((req, res, next) => {
    // If the user is in a class, then get the user from the class students list
    // This ensures that the user data is always up to date
    if (req.session.classId) {
        const user = classInformation.classrooms[req.session.classId].students[req.session.email];
        if (!user) {
            next();
            return;
        }

        classInformation.users[req.session.email] = user;
    }

    next();
});

app.use()

function getJSFiles(dir, base = dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
            results = results.concat(getJSFiles(full, base));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            results.push(full.slice(base.length + 1)); // relative path from base folder
        }
    }
    return results;
}

// Import API routes
const apiVersionFolders = fs.readdirSync("./api");
for (const apiVersionFolder of apiVersionFolders) {
    const controllerFolders = fs.readdirSync(`./api/${apiVersionFolder}`).filter((file) => file === "controllers");
    for (const controllerFolder of controllerFolders) {
        const router = express.Router();

        const routeFiles = getJSFiles(`./api/${apiVersionFolder}/${controllerFolder}`);
        for (const routeFile of routeFiles) {
            const registerRoute = require(`./api/${apiVersionFolder}/${controllerFolder}/${routeFile}`);
            if (typeof registerRoute === "function") {
                registerRoute(router);
                router.use(`/api/${apiVersionFolder}/${routeFile}`, registerRoute);
            }
        }

        app.use(`/api/${apiVersionFolder}`, router);
    }
}

// Initialize websocket routes
initSocketRoutes();

// Error handling middleware
app.use(errorHandlerMiddleware);

// Start the server

http.listen(settings.port, async () => {
    // Object.assign(authentication.whitelistedIps, await getIpAccess("whitelist"));
    // Object.assign(authentication.blacklistedIps, await getIpAccess("blacklist"));
    console.log(`Running on port: ${settings.port}`);
    if (!settings.emailEnabled) console.log("Email functionality is disabled.");
    if (!settings.googleOauthEnabled) console.log("Google Oauth functionality is disabled.");
    if (!settings.emailEnabled || !settings.googleOauthEnabled)
        console.log(
            'To enable the disabled function(s), follow the related instructions under "Hosting Formbar.js Locally" in the Formbar wiki page at https://github.com/csmith1188/Formbar.js/wiki'
        );
    logger.log("info", "Start");
});
