

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
// Create session 
app.use(session({
	secret: 'secret',
	resave: true,
	saveUninitialized: true
}));
// Allows express to parse requests
app.use(express.json());
app.use(express.urlencoded( {extended: true}));
app.use(express.static(__dirname + '/static'));
// Used for encription
const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';

// Establishing connection to database
var db = new sqlite3.Database('database/database.db');


// Functions
// Delete everything in table
function clearDatabase () {
    db.get(`DELETE FROM users`, (err) => {
        if (err) {
            console.log(err);
        }
    })
    return console.log('Database Deleted');
}

// Check if user has logged in
function isAuthenticated (req, res, next) {
  if (req.session.user) {
    next()
  }
  else {
    res.redirect('/login')
  }
}

// Endpoints
app.get('/', isAuthenticated, (req, res) => {
    if (req.session.perms == 0) {
        res.redirect('/createclass')
    } else {
        res.redirect('/selectclass')
    }
})
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

app.get('/home', isAuthenticated, (req, res) => {
    res.render('pages/index', {
        title: 'Formbar Home',
        color: '"dark blue"'
    })
})

app.get('/createclass', isAuthenticated, (req, res) => {
    res.render('pages/createclass', {
        title: 'Create Class',
        color: '"dark blue"'
    })
})

app.post('/createclass', isAuthenticated, (req, res) => {
    // Allow teacher to create class
    let className = req.body.name;
    let owners = req.body.owners;
    db.run(`INSERT INTO classroom(name, owner) VALUES(?, ?)`, 
    [className, owners], (err) => {
        if (err) {
            console.log(err);
        }
    })
    res.redirect('/home')
})


app.get('/selectclass', isAuthenticated, (req, res) => {
    res.render('pages/selectclass', {
        title: 'Select Class',
        color: '"dark blue"'
    })
})

app.post('/selectclass', isAuthenticated, (req, res) => {
    // Let user enter or join a teachers class
    let className = req.body.name;
    db.get(`SELECT id FROM classroom WHERE name=?`, [className], (err, id) => {
        if (err) {
            console.log(err);
        }
        console.log(id);
        db.get(`SELECT id FROM users WHERE username=?`, [req.session.user], (err, uid) => {
            if (err) {
                console.log(err);
            }
            console.log(uid);
            db.run(`INSERT INTO classusers(classuid, studentuid) VALUES(?, ?)`,
            [id.id, uid.id], (err) => {
                if (err) {
                    console.log(err);
                }
                console.log('User added to class');
            })
        })
    })
    res.redirect('/home')
})

app.get('/delete', (req, res) => {
    clearDatabase()
})












// Open server to listen on port 4000
app.listen(4000);