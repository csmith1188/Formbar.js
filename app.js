// Imported modules
const express = require('express');
const app = express();
const session = require('express-session');
const ejs = require('ejs');
const http = require('http').Server(app);
const fs = require('fs');
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

var sD = {

}


// This class is used to create a student to be stored in the sessions data
class Student {
    constructor(username, className='No Class') {
        cD.classes.push({
            
        })
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

// Endpoints
app.get('/', (req, res) => {
    
})

// A

// B

// C

//chat
app.get('/chat', (req, res) => {
    res.render('pages/chat', {
        title: 'Formbar Chat',
        color: '"dark blue"',
        io: io
    })

})
io.sockets.on('connection', function(socket) {
    socket.on('chat_message', function(message) {
        io.emit('chat_message', message);
    });

});


//control panel
app.get('/controlpanel', (req, res) => {
    res.render('pages/controlpanel', {
        title: 'Control Panel',
        color: '"dark blue"'
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

app.get('/home', (req, res) => {
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

    console.log(user.username + ' ' + user.permissions);
    var passwordCrypt = encrypt(user.password);
    if (user.permissions == "login") {


        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err);
            }
            // Decrypt users password
            let tempPassword = decrypt(JSON.parse(rows.password));
            if (rows.username == user.username && tempPassword == user.password) {
                // Add user to the session
                req.session.id = rows.id
                req.session.user = rows.username;
                req.session.perms = rows.permissions;
                res.redirect('/home');
            } else {
                res.redirect('/login')
            }
        })








    } else if (user.permissions == "new") {
        db.run(`INSERT INTO users(username, password, permissions) VALUES(?, ?, ?)`,
            [user.username, JSON.stringify(passwordCrypt), 2], (err) => {
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
            req.session.id = rows.id
            req.session.user = rows.username;
            req.session.perms = rows.permissions;
            res.redirect('/');

        })
    } else if (user.permissions == "guest") {

    }
})

// M

// N

// O

// P
app.get('/poll', (req, res) => {
    res.render('pages/poll', {
        title: 'Polls',
        color: '"dark blue"'
    })
})
// Q

// R

// S

// T

// U

// V

// W

// X

// Y

// Z































// Open server to listen on port 4000
http.listen(4000);