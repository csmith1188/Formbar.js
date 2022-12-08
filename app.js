// Imported modules
const express = require('express');
const session = require('express-session');
const ejs = require('ejs');
const fs = require('fs');
var app = express();
const http = require('http').createServer(app);
const { encrypt, decrypt } = require('./static/js/crypto.js');
const sqlite3 = require('sqlite3').verbose();
const io = require('socket.io')(http);
// Set EJS as our view engine
app.set('view engine', 'ejs')
// Create session for user information to be transferred from page to page
var sessionMiddleware = session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
});
// Allows express to parse requests
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/static'));

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

app.use(sessionMiddleware);

// Establishes the connection to the database. This allows for logins.
// Logins consist of usernames and passwords
// The database allows for manipulation of the elements of the formbar js
// These elements are the passwords,usernames, and the privledges of all users
var db = new sqlite3.Database('database/database.db');

// starts students off with no class, this allows the teacher to give thme one and make sure they aren't teachers
// the teacher privledge will be automatically assigned to the teacher when they log in to the formbar js
// The cd will determine wether the student has a role when they start or not
// This role could be guest, student, teacher, or admin depending ob the teacher
var cD = {
    noClass: { students: {} }
}

// This class is used to create a student to be stored in the sessions data
// Creating the student class to be stored in the database allows it to be mainpulated
class Student {
    // Needs username, id from the database, and if perms established already pass the uodated value
    // These will need to be put into the constructor in order to allow the creation of the class
    constructor(username, id, perms = 2) {
        cD.noClass.students[username] = {
            id: id,
            permissions: perms,
            pollRes: ''
        }
    }
}
// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
    // Needs the name of the class you want to create
    // The name of the class will be used later in tnhe database to allow lessons to operate
    constructor(className) {
        cD[className] = {
            students: {},
            pollStatus: false
        }
    }
}






// Functions




// Delete everything in table
// For testing purposes ONLY. DELETE WHEN COMMITTING TO RC
// Test only because this clears the database of all users and perms
// this takes away teacher perms, and they have to be manually added back in
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
app.get('/controlpanel', isAuthenticated, (req, res) => {
    let students = cD[req.session.class].students
    let keys = Object.keys(students);
    let allStuds = []
    for (var i = 0; i < keys.length; i++) {
        var val = { name: keys[i], perms: students[keys[i]].permissions}
        allStuds.push(val)
    } 
    res.render('pages/controlpanel', {
        title: "Control Panel",
        students: allStuds,
        pollStatus: cD[req.session.class].pollStatus
    })
})


// Loads which classes the teacher is an owner of
// This allows the teacher to be in charge of all classes
// The teacher can give aany perms to anyone they desire, which is useful at times
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
    let className = req.body.name;
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
    new Classroom(className)
    // Add the teacher to the newly created class
    cD[className].students[req.session.user] = user
    req.session.class = className;
    res.redirect('/home')
})

//chat
// This is the chat get endpoint, it gets the chat and allows it to be used
// It also sets the color and font for the chat, which will be used by students to participate in the lesson
// It also allows students to talk amongst one another, while the teacher can see messages
// It also allows for the use of socket.io, and makes good use of them
app.get('/chat', (req, res) => {
    res.render('pages/chat', {
        title: 'Formbar Chat',
        color: '"dark blue"',
        io: io
    })

})

// This is the socket.io, it allows for the connection to the server
// It allows for the chat messages to be actually sent to the chat
// It is what the chat uses to emit messages to the server, this allows for the database to record whatever is put in
// This could be useful to the teacher in case students say anything bad or do somehing that can get them banned
io.sockets.on('connection', function(socket) {
    console.log('a user connected');
    socket.on('chat_message', function(message) {
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
        color: 'purple'
    });
});

// This lets the user log into the server, it uses each element from the database to allow the server to do so
// This lets users actually log in instead of not being able to log in at all
// It uses the usernames, passwords, etc. to verify that it is the user that wants to log in logging in
// This also encryypts passwords to make sure people's accounts don't get hacked
app.post('/login', (req, res) => {
    var user = {
        username: req.body.username,
        password: req.body.password,
        permissions: req.body.userType
    }
    var passwordCrypt = encrypt(user.password);
    // Check whether user is logging in or signing up
    if (user.permissions == "login") {
        // Get the users login in data to verify password
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Check if a user with that name was found in the database
            if (rows) {
                // Decrypt users password
                let tempPassword = decrypt(JSON.parse(rows.password));
                if (rows.username == user.username && tempPassword == user.password) {
                    // Add user to the session
                    new Student(rows.username, rows.id, rows.permissions)
                    // Add a cookie to transfer user credentials across site
                    req.session.user = rows.username;
                    res.redirect('/');
                } else {
                    res.redirect('/login')
                }
            } else {
                res.redirect('/login')
            }
        })

    } else if (user.permissions == "new") {
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
            new Student(rows.username, rows.id)
            // Add the user to the session in order to transfer data between each page
            req.session.user = rows.username;
            res.redirect('/');

        })
    } else if (user.permissions == "guest") {

    }
})

// M

// N

// O

// P

//Renders the poll HTMl template
//allows for poll answers to be processed and stored
app.get('/poll', isAuthenticated, (req, res) =>{
    let user = {
        name:  req.session.user,
        class:  req.session.class
    }
    res.render('pages/polls', {
        title: 'Poll',
        color: '"dark blue"',
        user: JSON.stringify(user),
        pollStatus: cD[req.session.class].pollStatus
    })
    console.log(user);
let answer = req.query.letter;
if (answer) {
    console.log(answer);
}


})

app.post('/poll', (req, res) =>{
   let answer = req.body.poll
   if (answer) {
    db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
    console.log(answer);
   }

   res.redirect('/poll')
})




// Q

// R

// S
// This allows people to select thier class
// Selecting classes allows for teacher to select thier class
// Allows class to run smoothly
// Allows the lesson to actually work and run without problems
app.get('/selectclass', isLoggedIn, (req, res) => {
    res.render('pages/selectclass', {
        title: 'Select Class',
        color: '"dark blue"'
    })
})
// Further allowing for class selecting
// It allows teacher to actually select classes
// This is required for the formbar js
// The formbar js extensively uses this to work and run correctly
app.post('/selectclass', isLoggedIn, (req, res) => {
    // Let user enter or join a teachers class
    let className = req.body.name;
    // Find the id of the class from the database
    db.get(`SELECT id FROM classroom WHERE name=?`, [className], (err, id) => {
        if (err) {
            console.log(err);
            res.send('Something went wrong')
        }
        // Check to make sure there was a class with that name
        if (id && cD[className]) {
            // Find the id of the user who is trying to join the class
            db.get(`SELECT id FROM users WHERE username=?`, [req.session.user], (err, uid) => {
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
                        var user = cD.noClass.students[req.session.user]
                        // Remove teacher from old class
                        delete cD.noClass.students[req.session.user]
                        // Add the teacher to the newly created class
                        cD[className].students[req.session.user] = user
                        console.log('User added to class');
                        req.session.class = className;
                        res.redirect('/home')
                    })
            })
        } else {
            res.send('No Open Class with that Name')
        }
    })

})

// T

// U

// V

// W

// X

// Y

// Z



//Handles the webscoket communications
io.sockets.on('connection', function(socket) {
    console.log('Connected to socket');
      // /poll websockets for updating the database
      socket.on('pollResp', function(user, res) {
        user = JSON.parse(user)
        cD[user.class].students[user.name].pollRes = res;
        console.log(cD[user.class].students[user.name]);
        db.get('UPDATE users SET pollRes = ? WHERE username = ?', [res, user.name])
    });
    socket.on('permChange', function(user, res) {
        cD[socket.request.session.class].students[user].permissions = res
        db.get('UPDATE users SET permissions = ? WHERE username = ?', [res, user])
    });
    socket.on('startPoll', function() {
        cD[socket.request.session.class].pollStatus = true
    });
    socket.on('endPoll', function() {
        cD[socket.request.session.class].pollStatus = false
    });
    socket.on('chat_message', function(message) {
        io.emit('chat_message', message);
    });
});


http.listen(4000, () => {
    console.log('Running on port: 4000');
});

