// Imported modules
const express = require('express');
const session = require('express-session'); //For storing client login data
const ejs = require('ejs');
const fs = require('fs');
const { encrypt, decrypt } = require('./static/js/crypto.js'); //For encrypting passwords
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// get config vars
dotenv.config();

// access config var
// console.log(process.env.TOKEN_SECRET)


var app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Set EJS as our view engine
app.set('view engine', 'ejs');

// Create session for user information to be transferred from page to page
var sessionMiddleware = session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
});

// Allows express to parse requests
app.use(express.urlencoded({ extended: true }));

// Use a static folder for web page assets
app.use(express.static(__dirname + '/static'));

// PROMPT: Does this allow use to associate client logins with their websocket connection?
// PROMPT: Where did you find information on this. Please put the link here.
// For further uses on this use this link: https://socket.io/how-to/use-with-express-session
io.use(function (socket, next) {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// PROMPT: What does this do?
app.use(sessionMiddleware);



// Establishes the connection to the database file
var db = new sqlite3.Database('database/database.db');

//cD is the class dictionary, it stores all of the information on classes and students
var cD = {
    noClass: { students: {} }
}

var classNames = []

// This class is used to create a student to be stored in the sessions data
class Student {
    // Needs username, id from the database, and if perms established already pass the updated value
    // These will need to be put into the constructor in order to allow the creation of the object
    constructor(username, id, perms = 2) {
        this.id = id;
        this.permissions = perms;
        this.pollRes = '';
        this.pollTextRes = '';
        this.help = '';
    }
}


// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
    // Needs the name of the class you want to create
    constructor(className) {
        this.className = className;
        this.students = {};
        this.pollStatus = false;
        this.posPollResObj = {};
        this.posTextRes = false;
        this.pollPrompt = '';
        this.key = '';
    }
}

//Permssion level needed to access each page
pagePermissions = {
    controlpanel: 0,
    chat: 2,
    poll: 2,
    virtualbar: 2
}




// Functions
//-----------
//Clears the database
//Removes all users, teachers, and claseses
//ONLY USE FOR TESTING PURPOSES 
function clearDatabase() {
    db.get(`DELETE FROM users`, (err) => {
        if (err) {
            console.log(err);
        }
    })
    return console.log('Database Deleted');
}

// Check if user has logged in
// Place at the start of any page that needs to verify if a user is logged in or not
// This allows websites to check on thier own if the user is logged in
// This also allows for the website to check for perms
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        if (cD.noClass.students[req.session.user]) {
            if (cD.noClass.students[req.session.user].permissions == 0) {
                res.redirect('/createclass')
            } else {
                res.redirect('/selectclass')
            }
        } else {
            next()
        }

    } else {
        res.redirect('/login')
    }
}

// Check if user is logged in. Only used for create and select class pages
// Use isAuthenticated function for any other pages
// Created for the first page since there is no check before this
// This allows for a first check in where the user gets checked by the webpage
function isLoggedIn(req, res, next) {
    if (req.session.user) {
        next()
    } else {
        res.redirect('/login')
    }
}

// Check if user has the permission levels to enter that page
function permCheck(req, res, next) {
    if (req.url) {
        // Defines users desired endpoint
        let urlPath = req.url
        // Checks if url has a / in it and removes it from the string
        if (urlPath.indexOf('/') != -1) {
            urlPath = urlPath.slice(urlPath.indexOf('/') + 1)
        }
        // Check for ?(urlParams) and removes it from the string
        if (urlPath.indexOf('?') != -1) {
            console.log(urlPath.indexOf('?'));
            urlPath = urlPath.slice(0, urlPath.indexOf('?'))
        }
        // Checks if users permnissions are high enough
        if (cD[req.session.class].students[req.session.user].permissions <= pagePermissions[urlPath]) {
            next()
        } else {
            res.send('Not High Enough Permissions')
        }
    }
}


function joinClass(className, userName, code) {
    return new Promise((resolve, reject) => {
        // Find the id of the class from the database
        db.get(`SELECT id FROM classroom WHERE name=?`, [className], (err, id) => {
            if (err) {
                console.log(err);
                res.send('Something went wrong')
            }
            // Check to make sure there was a class with that name
            if (id && cD[className].key == code) {
                // Find the id of the user who is trying to join the class
                db.get(`SELECT id FROM users WHERE username=?`, [userName], (err, uid) => {
                    if (err) {
                        console.log(err);
                    }
                    // Add the two id's to the junction table to link the user and class
                    db.run(`INSERT INTO classusers(classuid, studentuid) VALUES(?, ?)`,
                        [id.id, uid.id], (err) => {
                            if (err) {
                                console.log(err);
                            }
                            // Get the teachers session data ready to transport into new class
                            var user = cD.noClass.students[userName]
                            // Remove teacher from old class
                            delete cD.noClass.students[userName]
                            // Add the student to the newly created class
                            cD[className].students[userName] = user
                            console.log('User added to class');
                            resolve(true);
                        })
                })
            } else {
                resolve(false);
            }
        })
    })
}

// Oauth2 Access Token Generator
function generateAccessToken(username) {
    return jwt.sign(username, process.env.TOKEN_SECRET, { expiresIn: '1800s' });
  }

// Endpoints
// This is the root page, it is where the users first get checked by the home page
// It is used to redirect to the home page
// This allows it to check if the user is logged in along with the home page
// It also allows for redirection to any other page if needed
app.get('/', isAuthenticated, (req, res) => {
    res.redirect('/home')
})


// A

// B

// C


// An endpoint for the teacher to control the formbar
// Used to update students permissions, handle polls and their corresponsing responses
// On render it will send all students in that class to the page
app.get('/controlpanel', isAuthenticated, permCheck, (req, res) => {
    let students = cD[req.session.class].students
    let keys = Object.keys(students);
    let allStuds = []
    for (var i = 0; i < keys.length; i++) {
        var val = { name: keys[i], perms: students[keys[i]].permissions, pollRes: { lettRes: students[keys[i]].pollRes, textRes: students[keys[i]].pollTextRes }, help: students[keys[i]].help }
        allStuds.push(val)
    }
    res.render('pages/controlpanel', {
        title: "Control Panel",
        students: allStuds,
        pollStatus: cD[req.session.class].pollStatus,
        key: cD[req.session.class].key.toUpperCase()
    })
})


// Loads which classes the teacher is an owner of
// This allows the teacher to be in charge of all classes
// The teacher can give any perms to anyone they desire, which is useful at times
// This also allows the teacher to kick or ban if needed
app.get('/createclass', isLoggedIn, (req, res) => {
    var ownerClasses = []
    // Finds all classes the teacher is the owner of
    db.all(`SELECT name FROM classroom WHERE owner=?`,
        [req.session.user], (err, rows) => {
            rows.forEach(row => {
                ownerClasses.push(row.name)
            })
            res.render('pages/createclass', {
                title: 'Create Class',
                color: '"dark blue"',
                ownerClasses: ownerClasses
            })
        })
})

// Allow teacher to create class
// Allowing the teacher to create classes is vital to wether the lesson actually works or not, because they have to be allowed to create a teacher class
// This will allow the teacher to give students student perms, and guests student perms as well
// Plus they can ban and kick as long as they can create classes
app.post('/createclass', isLoggedIn, (req, res) => {
    let submittionType = req.body.submittionType
    let className = req.body.name.toLowerCase();
    // Checks if teacher is creating a new class or joining an old class
    if (submittionType == 'create') {
        // Add classroom to the database
        db.run(`INSERT INTO classroom(name, owner) VALUES(?, ?)`,
            [className, req.session.user], (err) => {
                if (err) {
                    console.log(err);
                }
            })
    }

    // Get the teachers session data ready to transport into new class
    var user = cD.noClass.students[req.session.user]
    // Remove teacher from old class
    delete cD.noClass.students[req.session.user]
    // Add class into the session data
    cD[className] = new Classroom(className);
    // Add the teacher to the newly created class
    cD[className].students[req.session.user] = user
    req.session.class = className;
    classNames.push(className)
    //generates a 4 character key
    //this is used for students who want to enter a class
    let keygen = 'abcdefghijklmnopqrstuvwxyz123456789'
    for(let i = 0; i<4; i++){
        let letter = keygen[Math.floor(Math.random()*keygen.length)]
        cD[className].key += letter
    }


    res.redirect('/home')
})

//chat
// This is the chat get endpoint, it gets the chat and allows it to be used
// It also sets the color and font for the chat, which will be used by students to participate in the lesson
// It also allows students to talk amongst one another, while the teacher can see messages
// It also allows for the use of socket.io, and makes good use of them
app.get('/chat', permCheck, (req, res) => {
    res.render('pages/chat', {
        title: 'Formbar Chat',
        color: '"dark blue"',
        io: io
    })

})
//
//
//
//


// This is the socket.io, it allows for the connection to the server
// It allows for the chat messages to be actually sent to the chat
// It is what the chat uses to emit messages to the server, this allows for the database to record whatever is put in
// This could be useful to the teacher in case students say anything bad or do somehing that can get them banned
io.sockets.on('connection', function (socket) {
    console.log('a user connected');
    socket.on('chat_message', function (message) {
        io.emit('chat_message', message);
    });

});
// D
// Clears the database, this deletes the database
// This will allow for the server to be reset so new things can be tested
// This is purely for testing purposes, and will be removed in the future
// Clearing the database removes all permissions and makes you manually reset them
app.get('/delete', (req, res) => {
    clearDatabase()
})

// E

// F

// G

// H
// This is the home page, where the teacher and students can access can access the formbar js
// It also shows the color and title of the formbar js
// It renders the home page so teachers and students can navigate to it
// It uses the authenitication to make sure the user is actually logged in
app.get('/home', isAuthenticated, (req, res) => {
    res.render('pages/index', {
        title: 'Formbar Home',
        color: '"dark blue"'
    })
})


app.get('/help', isAuthenticated, (req, res) => {
    res.render('pages/help'), {
        color: '"dark blue"'
}
})

// I

// J

// K

// L
// This renders the login page
// It displays the title and the color of the login page of the formbar js
// It allows for the login to check if the user wants to login to the server
// This makes sure the lesson can see the students and work with them
app.get('/login', (req, res) => {
    res.render('pages/login', {
        title: 'Formbar',
        color: 'purple', 
        redurl: ''
    });
});

// This lets the user log into the server, it uses each element from the database to allow the server to do so
// This lets users actually log in instead of not being able to log in at all
// It uses the usernames, passwords, etc. to verify that it is the user that wants to log in logging in
// This also encryypts passwords to make sure people's accounts don't get hacked
app.post('/login', async (req, res) => {
    var user = {
        username: req.body.username,
        password: req.body.password,
        loginType: req.body.loginType,
        userType: req.body.userType
    }
    var passwordCrypt = encrypt(user.password);
    // Check whether user is logging in or signing up
    if (user.loginType == "login") {
        // Get the users login in data to verify password
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], async (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Check if a user with that name was found in the database
            if (rows) {
                // Decrypt users password
                let tempPassword = decrypt(JSON.parse(rows.password));
                if (rows.username == user.username && tempPassword == user.password) {
                    // Add user to the session
                    cD.noClass.students[rows.username] = new Student(rows.username, rows.id, rows.permissions);
                    // Add a cookie to transfer user credentials across site
                    req.session.user = rows.username;
                    if (req.body.className) {
                        req.session.class = req.body.className;
                        let checkJoin = await joinClass(req.body.className, user.username, cD[req.body.className].key)
                        if (checkJoin) {
                            res.json({login: true})
                        } else (
                            res.json({login: false})
                        )
                    } else {
                        res.redirect('/');
                    }
                } else {
                    res.redirect('/login')
                }
            } else {
                res.redirect('/login')
            }
        })

    } else if (user.loginType == "new") {
        // Add the new user to the database 
        db.run(`INSERT INTO users(username, password, permissions) VALUES(?, ?, ?)`,
            [user.username, JSON.stringify(passwordCrypt), 2], (err) => {
                if (err) {
                    console.log(err);
                }
                console.log('Success');
            })
        // Find the user in which was just created to get the id of the user 
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Add user to session
            cD.noClass.students[rows.username] = new Student(rows.username, rows.id);
            // Add the user to the session in order to transfer data between each page
            req.session.user = rows.username;
            res.redirect('/');

        })
    } else if (user.loginType == "guest") {

    } else if (user.loginType == "newbot") {
        db.run(`INSERT INTO users(username, password, permissions) VALUES(?, ?, ?)`,
            [user.username, JSON.stringify(passwordCrypt), 1], (err) => {
                if (err) {
                    console.log(err);
                }
                console.log('Success');
            })
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Add user to session
            cD.noClass.students[rows.username] = new Student(rows.username, rows.id, rows.permissions);
            // Add the user to the session in order to transfer data between each page
            req.session.user = rows.username;
            res.redirect('/');
        })
    }
})

// M

// N

// O

// P

//Renders the poll HTMl template
//Allows for poll answers to be processed and stored
app.get('/poll', isAuthenticated, permCheck, (req, res) => {
    let user = {
        name: req.session.user,
        class: req.session.class
    }
    let posPollRes = cD[req.session.class].posPollResObj
    res.render('pages/polls', {
        title: 'Poll',
        color: '"dark blue"',
        user: JSON.stringify(user),
        pollStatus: cD[req.session.class].pollStatus,
        posPollRes: JSON.stringify(posPollRes),
        posTextRes: cD[req.session.class].posTextRes,
        pollPrompt: cD[req.session.class].pollPrompt
    })
    let answer = req.query.letter;
    if (answer) {
        cD[req.session.class].students[req.session.user].permissions = answer
        db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
    }


})

//takes a post request to set a poll response
app.post('/poll', (req, res) =>{
   let answer = req.body.poll
   if (answer) {
    cD[req.session.class].students[req.session.user].permissions = answer
    db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
   }
    res.redirect('/poll')
})




// Q

// R

// S

// selectclass
//Send user to the select class page
app.get('/selectclass', isLoggedIn, (req, res) => {
    res.render('pages/selectclass', {
        title: 'Select Class',
        color: '"dark blue"',
        classNames: classNames
    })
})


//Adds user to a selected class, typically from the select class page
app.post('/selectclass', isLoggedIn, async (req, res) => {
    let className = req.body.name.toLowerCase();
    let code =  req.body.key.toLowerCase();
    let checkComplete = await joinClass(className, req.session.user, code)
    if (checkComplete) {
        req.session.class = className;
        res.redirect('/home')
    } else {
        res.send('No Open Class with that Name')
    }
});

// T

// U

// V
app.get('/virtualbar', isAuthenticated, permCheck, (req, res) => {
    if (req.query.bot == "true") {
        res.json(cD[req.session.class])
    } else {
        res.render('pages/virtualbar', {
            title: 'Virtual Bar',
            color: '"dark blue"',
            io: io,
            className: cD[req.session.class].className
        })
    }
})
// W

// X

// Y

// Z



// OAuth2

app.get('/oauth/login', (req, res) => {
    let redurl = req.query.redurl
    res.render('pages/login', {
        title: 'Formbar',
        color: 'purple',
        redurl: redurl
    })
})

app.post('/oauth/login', (req, res) => {
    let redurl = req.body.redurl
    var user = {
        username: req.body.username,
        password: req.body.password,
        loginType: req.body.loginType,
        userType: req.body.userType
    }
    var passwordCrypt = encrypt(user.password);
    // Check whether user is logging in or signing up
    if (user.loginType == "login") {
        // Get the users login in data to verify password
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], async (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Check if a user with that name was found in the database
            if (rows) {
                // Decrypt users password
                let tempPassword = decrypt(JSON.parse(rows.password));
                if (rows.username == user.username && tempPassword == user.password) {
                    let token = generateAccessToken({ username: user.username })
                    res.json(token)
                } else {
                    res.redirect('/oauth/login?redurl=' + redurl)
                }
            } else {
                res.redirect('/oauth/login?redurl=' + redurl)
            }
        })

    } else if (user.loginType == "new") {
        // Add the new user to the database 
        db.run(`INSERT INTO users(username, password, permissions) VALUES(?, ?, ?)`,
            [user.username, JSON.stringify(passwordCrypt), 2], (err) => {
                if (err) {
                    console.log(err);
                }
                console.log('Success');
            })
        // Find the user in which was just created to get the id of the user 
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Add user to session
            cD.noClass.students[rows.username] = new Student(rows.username, rows.id);
            // Add the user to the session in order to transfer data between each page
            req.session.user = rows.username;
            res.redirect('/');

        })
    }
})


// Middleware for sockets
// Authentication for users and bots to connect to formbar websockets
// The user must be logged in order to connect to websockets
io.use((socket, next) => {
    if (socket.request.session.user) {
        next();
    } else {
        console.log("Authentication Failed");
        next(new Error("invalid"));
    }
  });
//Handles the webscoket communications
io.sockets.on('connection', function (socket) {
    console.log('Connected to socket');
    if (socket.request.session.user) {
        socket.join(cD[socket.request.session.class].className);
    }
    // /poll websockets for updating the database
    socket.on('pollResp', function (res, textRes) {
        cD[socket.request.session.class].students[socket.request.session.user].pollRes = res;
        cD[socket.request.session.class].students[socket.request.session.user].pollTextRes = textRes;
        db.get('UPDATE users SET pollRes = ? WHERE username = ?', [res, socket.request.session.user])
    });
    // Changes Permission of user. Takes which user and the new permission level
    socket.on('permChange', function (user, res) {
        cD[socket.request.session.class].students[user].permissions = res
        db.get('UPDATE users SET permissions = ? WHERE username = ?', [res, user])
    });
    // Starts a new poll. Takes the number of responses and whether or not their are text responses
    socket.on('startPoll', function (resNumber, resTextBox, pollPrompt) {
        cD[socket.request.session.class].pollStatus = true
        // Creates an object for every answer possible the teacher is allowing
        for (let i = 0; i < resNumber; i++) {
            letterString = "abcdefghijklmnopqrstuvwxyz"
            cD[socket.request.session.class].posPollResObj[letterString[i]] = "Answer " + letterString[i].toUpperCase();

        }
        cD[socket.request.session.class].posTextRes = resTextBox
        cD[socket.request.session.class].pollPrompt = pollPrompt
    });
    // End the current poll. Does not take any arguments
    socket.on('endPoll', function () {
        cD[socket.request.session.class].posPollResObj = {}
        cD[socket.request.session.class].pollStatus = false
    });

    socket.on('chat_message', function (message) {
        io.emit('chat_message', message);
    });
    // Reloads any page with the reload function on. No arguments
    socket.on('reload', function () {
        io.emit('reload')
    })
    // Sends poll and student response data to client side virtual bar
    socket.on('vbData', function () {
        io.to(cD[socket.request.session.class].className).emit('vbData', JSON.stringify(cD[socket.request.session.class]))
    })

    socket.on('help', function(reason, time){
        console.log(reason);
        cD[socket.request.session.class].students[socket.request.session.user].help = `<b>${socket.request.session.user}</b> reason: <b>${reason}</b> time sent: ${time}`
    })
    socket.on('deleteUser', function(userName){
        cD.noClass.students[userName] = cD[socket.request.session.class].students[userName]
        delete cD[socket.request.session.class].students[userName]
        console.log(userName + ' removed from class');
    })
    socket.on('joinRoom', function (className) {
        console.log("Working");
        socket.join(className);
    })
});



http.listen(420, () => {
    console.log('Running on port: 420');
});

