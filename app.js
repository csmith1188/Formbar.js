// Imported modules
const express = require('express');
const ejs = require('ejs');
const fs = require('fs');
// Start an express app
var app = express();
// Set EJS as our view engine
app.set('view engine', 'ejs')
// Allows express to parse requests
app.use(express.urlencoded( {extended: true}));
app.use(express.static(__dirname + '/static'));
// Functions

// Endpoints
app.get('/', (req, res) => {
    res.redirect('/login')
})
app.get('/login', (req, res) => {
    res.render('pages/login', {
        title: 'Formbar',
        color: 'purple',
        main: `
            <button id="logInButton" class="pressed" onclick="changeUserType(this);">Log in</button>
            <button id="newAccountButton" onclick="changeUserType(this);">New account</button>
            <button id="guestButton" onclick="changeUserType(this);">Use as guest</button>
            <form action="login" method="post" style="margin-bottom: 16px;">
            <input type="text" id="usernameBox" name="username" class="box" placeholder="Name" value="" autocomplete="off" required>
            <input type="password" id="passwordBox" name="password" class="box" placeholder="Password" value="" required>
            <a href="/changepassword" id="forgotPassword">Forgot password</a>
            <input type="hidden" id="userTypeBox" name="userType" value="login">
            <input type="hidden" id="forwardBox" name="forward">
            <input type="hidden" id="botBox" name="bot" value="False">
            <input type="submit" id="submitButton" class="button unselectable" value="Log in" onsubmit="return false;">
            </form>`
    });
});

app.post('/login', (req, res) => {
    var user = { 
        username: req.body.username,
        password: req.body.password,
        userType: req.body.userType,
        
    }
    console.log(user.username + ' ' + user.userType);
    res.send('Ty')
})

// Open server to listen on port 4000
app.listen(4000);