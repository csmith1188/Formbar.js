// Imported modules
const express = require('express');
const session = require('express-session');
const ejs = require('ejs');
const fs = require('fs');
const { encrypt, decrypt } = require('./static/js/crypto.js');
const sqlite3 = require('sqlite3').verbose();

// Start an express app
var app = express();
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

// Endpoints
app.get('/', isAuthenticated, (req, res) => {

})

// A

// B

// C

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
                res.redirect('/');
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
app.listen(4000);