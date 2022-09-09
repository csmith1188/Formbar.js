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
var fullheader = `
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title> <%- title %></title>
      <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
      <link rel="icon" href="{{ url_for('static', filename='img/favicon.ico') }}">
     
      <style>
        #homeLink {
          position: absolute;
          left: 8px;
          top: 8px;
          color: var(--light-red);
          font-size: 20px;
          font-weight: bold;
          text-decoration: none;
        }

        .light #homeLink {
          color: var(--color-red);
        }

        #homeLink:hover {
          color: var(--main-color);
        }
      </style>
  </head>


  <script src="{{url_for('static', filename='js/jquery.js')}}"></script>
  <script src="{{url_for('static', filename='js/socket.io.min.js')}}"></script>
  <script src="{{url_for('static', filename='js/header.js')}}"></script>
  
`
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
app.get('/game/2048', (req, res) => {
    res.render('games/2048', {
        header: `
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href='/css/style.css' type='text/css' }}">
        <link rel="icon" href="{{ url_for('static', filename='img/favicon.ico') }}">
       
        <style>
          #homeLink {
            position: absolute;
            left: 8px;
            top: 8px;
            color: var(--light-red);
            font-size: 20px;
            font-weight: bold;
            text-decoration: none;}
          .light #homeLink { color: var(--color-red); }
          #homeLink:hover {color: var(--main-color); }
        </style>
        </head>
`, 
title: ` <title> 2048 </title>`,
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