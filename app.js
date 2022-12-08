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
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));
// Allows express to parse requests
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/static'));
// Constants for the password encryption module to use
const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';

// Establishing connection to database
var db = new sqlite3.Database('database/database.db');


var cD = {
    noClass: { students: {} }
}

// This class is used to create a student to be stored in the sessions data
class Student {
    // Needs username, id from the database, and if perms established already pass the uodated value
    constructor(username, id, perms = 2) {
        cD.noClass.students[username] = {
            id: id,
            permissions: perms,
            pollRes: ''
        }
    }
}
// This class is used to add a new classroom to the session data
class Classroom {
    // Needs the name of the class you want to create
    constructor(className) {
        cD[className] = {
            students: {}
        }
    }
}








// Functions




// Delete everything in table
// For testing purposes ONLY. DELETE WHEN COMMITTING TO RC
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
function isLoggedIn(req, res, next) {
    if (req.session.user) {
        next()
    } else {
        res.redirect('/login')
    }
}

// Endpoints
app.get('/', isAuthenticated, (req, res) => {
    res.redirect('/home')
})

// A

// B

// C
// Loads which classes the teacher is an owner of
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
app.get('/chat', (req, res) => {
    res.render('pages/chat', {
        title: 'Formbar Chat',
        color: '"dark blue"',
        io: io
    })

})
// D
app.get('/delete', (req, res) => {
    clearDatabase()
})

// E

// F

// G

// H

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

app.get('/login', (req, res) => {
    res.render('pages/login', {
        title: 'Formbar',
        color: 'purple'
    });
});


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
app.get('/poll', (req, res) =>{
    let user = {
        name:  req.session.user,
        class:  req.session.class
    }
    res.render('pages/polls', {
        title: 'Poll',
        color: '"dark blue"',
        user: JSON.stringify(user)
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

app.get('/selectclass', isLoggedIn, (req, res) => {
    res.render('pages/selectclass', {
        title: 'Select Class',
        color: '"dark blue"'
    })
})

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
    socket.on('chat_message', function(message) {
        io.emit('chat_message', message);
    });
});


http.listen(4000, () => {
    console.log('Running on port: 4000');
});

