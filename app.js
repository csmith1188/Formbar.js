

// Imported modules
const express = require('express');
const session = require('express-session');
const ejs = require('ejs');
const fs = require('fs');
const { encrypt, decrypt } = require('./static/js/crypto.js');
const sqlite3 = require('sqlite3');

var ip = "127.0.0.1"
// Start an express app
var app = express();
// Set EJS as our view engine
app.set('view engine', 'ejs')
// Allows express to parse requests
app.use(session({
	secret: 'secret',
	resave: true,
	saveUninitialized: true
}));
app.use(express.json());
app.use(express.urlencoded( {extended: true}));
app.use(express.static(__dirname + '/static'));
// Used for encription
const algorithm = 'aes-256-ctr';
const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';


// Functions


// Endpoints
app.get('/', (req, res) => {
    res.redirect('/login')
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
        perms: req.body.userType
    }
    console.log(user.username + ' ' + user.perms);
    var passwordCrypt = encrypt(user.password);
    if (user.perms == "login") {

    } else if (user.perms == "new") {
        let db = new sqlite3.Database('database/database.db');
            db.run(`INSERT INTO users(username, password, permissions) VALUES(?, ?, ?)`,
            [user.username, JSON.stringify(passwordCrypt), user.perms], (err) => {
                if (err) {
                    console.log(err);
                }
                console.log('Success');
            })
        db.close();
        // db.all(`SELECT * FROM users ORDER BY username`, (err, rows) => {
        //     if (err) {
        //         console.log(err);
        //     }
        //     rows.forEach( row => {
        //     console.log(row);
        //     let username = row.username;
        //     console.log(row.password);
        //     let password = decrypt(JSON.parse(row.password));
        //     console.log(password);
        // })
        // })
        // db.close();
        res.redirect('/selectclass')
    } else if (user.perms == "guest") {

    }
})

app.get('/home', (req, res) => {
    res.render('pages/index', {
        title: 'Formbar Home',
        color: '"dark blue"'
    })
})











// Open server to listen on port 4000
app.listen(4000);