const express = require('express');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

var app = express()

dotenv.config();

// Create session for user information to be transferred from page to page
var sessionMiddleware = session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
});



app.use(sessionMiddleware);

app.set('view engine', 'ejs')



function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = req.query.token

    if (token == null) return res.redirect("/login")

    jwt.verify(token, process.env.TOKEN_SECRET, (err, user) => {
        if (err) console.log(err)

        if (err) return res.sendStatus(403)
        req.session.user = user.username

        next()
    })
}

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next()
    } else {
        res.redirect("/login")
    }
}

app.get("/login", (req, res) => {
    res.render("login")
})

app.get("/", isAuthenticated, (req, res) => {
    res.render("home", {
        name: req.session.user
    })
})

app.get('/oauth', authenticateToken, (req, res) => {
    res.redirect("/")
})



app.listen(4000)