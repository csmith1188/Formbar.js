// Imported modules
const express = require('express')
const session = require('express-session') //For storing client login data
const ejs = require('ejs')
const fs = require('fs')
const path = require('path')
const { encrypt, decrypt } = require('./static/js/crypto.js') //For encrypting passwords
const sqlite3 = require('sqlite3').verbose()
const jwt = require('jsonwebtoken')
const dotenv = require('dotenv')
const excelToJson = require('convert-excel-to-json')
const multer = require('multer')
const { time } = require('console')
const upload = multer({ dest: 'uploads/' })

// get config vars
dotenv.config()



var app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

// Set EJS as our view engine
app.set('view engine', 'ejs')

// Create session for user information to be transferred from page to page
var sessionMiddleware = session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
})

// Allows express to parse requests
app.use(express.urlencoded({ extended: true }))

// Use a static folder for web page assets
app.use(express.static(__dirname + '/static'))

// PROMPT: Does this allow use to associate client logins with their websocket connection?
// PROMPT: Where did you find information on this. Please put the link here.
// For further uses on this use this link: https://socket.io/how-to/use-with-express-session
io.use(function (socket, next) {
    sessionMiddleware(socket.request, socket.request.res || {}, next)
})

// PROMPT: What does this do?
app.use(sessionMiddleware)



// Establishes the connection to the database file
var db = new sqlite3.Database('database/database.db')

//cD is the class dictionary, it stores all of the information on classes and students
var cD = {
    noClass: { students: {} }
}


// This class is used to create a student to be stored in the sessions data
class Student {
    // Needs username, id from the database, and if perms established already pass the updated value
    // These will need to be put into the constructor in order to allow the creation of the object
    constructor(username, id, perms = 2, API) {
        this.username = username
        this.id = id
        this.permissions = perms
        this.pollRes = ''
        this.pollTextRes = ''
        this.help = ''
        this.break = false
        this.quizScore = ''
        this.API = API
    }
}


// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
    // Needs the name of the class you want to create
    constructor(className, key) {
        this.className = className
        this.students = {}
        this.pollStatus = false
        this.posPollResObj = {}
        this.posTextRes = false
        this.pollPrompt = ''
        this.key = key
        this.lesson = {}
        this.activeLesson = false
        this.steps
        this.currentStep = 0
        this.quizObj
        this.mode = 'poll'
    }
}
//allows quizzes to be made
class Quiz {
    constructor(numOfQuestions, maxScore) {
        this.questions = []
        this.totalScore = maxScore
        this.numOfQuestions = numOfQuestions
        this.pointsPerQuestion = this.totalScore / numOfQuestions
    }
}


//allows lessons to be made
class Lesson {
    constructor(date, content) {
        this.date = date
        this.content = content
    }
}

//Permssion level needed to access each page
pagePermissions = {
    controlpanel: 0,
    chat: 2,
    poll: 2,
    virtualbar: 2,
    makeQuiz: 0,
    bgm: 2,
    sfx: 2,
}




// Functions
//-----------
//Clears the database
//Removes all users, teachers, and claseses
//ONLY USE FOR TESTING PURPOSES
function clearDatabase() {
    db.get(`DELETE FROM users`, (err) => {
        if (err) {
            console.log(err)
        }
    })
    return console.log('Database Deleted')
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

    } else if (req.session.api) {
        next()
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
            console.log(urlPath.indexOf('?'))
            urlPath = urlPath.slice(0, urlPath.indexOf('?'))
        }

        if (req.session.api) {
            next()
        } else {
            // Checks if users permnissions are high enough
            if (cD[req.session.class].students[req.session.user].permissions <= pagePermissions[urlPath]) {
                next()
            } else {
                res.send('Not High Enough Permissions')
            }
        }
    }
}


function joinClass(userName, code) {
    return new Promise((resolve, reject) => {
        // Find the id of the class from the database
        db.get(`SELECT id FROM classroom WHERE key=?`, [code], (err, id) => {
            if (err) {
                console.log(err)
                res.send('Something went wrong')
            }
            // Check to make sure there was a class with that name
            if (id && cD[code].key == code) {
                // Find the id of the user who is trying to join the class
                db.get(`SELECT id FROM users WHERE username=?`, [userName], (err, uid) => {
                    if (err) {
                        console.log(err)
                    }
                    // Add the two id's to the junction table to link the user and class
                    db.run(`INSERT INTO classusers(classuid, studentuid) VALUES(?, ?)`,
                        [id.id, uid.id], (err) => {
                            if (err) {
                                console.log(err)
                            }
                            // Get the teachers session data ready to transport into new class
                            var user = cD.noClass.students[userName]
                            // Remove teacher from old class
                            delete cD.noClass.students[userName]
                            // Add the student to the newly created class
                            cD[code].students[userName] = user
                            console.log('User added to class')
                            resolve(true)
                        })
                })
            } else {
                resolve(false)
            }
        })
    })
}

// Oauth2 Access Token Generator
function generateAccessToken(username, api) {
    return jwt.sign(username, api, { expiresIn: '1800s' })
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

app.get('/apikey', isAuthenticated, (req, res) => {
    res.render('pages/APIKEY', {
        title: "API KEY",
        API: cD[req.session.class].students[req.session.user].API
    })
})

// B

// C


// An endpoint for the teacher to control the formbar
// Used to update students permissions, handle polls and their corresponsing responses
// On render it will send all students in that class to the page
app.get('/controlpanel', isAuthenticated, permCheck, (req, res) => {

    let students = cD[req.session.class].students
    let keys = Object.keys(students)
    let allStuds = []
    for (var i = 0; i < keys.length; i++) {
        var val = { name: keys[i], perms: students[keys[i]].permissions, pollRes: { lettRes: students[keys[i]].pollRes, textRes: students[keys[i]].pollTextRes }, help: students[keys[i]].help }
        allStuds.push(val)
    }
    res.render('pages/controlpanel', {
        title: "Control Panel",
        students: allStuds,
        pollStatus: cD[req.session.class].pollStatus,
        key: cD[req.session.class].key.toUpperCase(),
        steps: cD[req.session.class].steps,
        currentStep: cD[req.session.class].currentStep
    })

})


app.post('/controlpanel', upload.single('spreadsheet'), isAuthenticated, permCheck, (req, res) => {

    let steps = []

    if (req.file) {
        cD[req.session.class].currentStep = 0
        const result = excelToJson({
            sourceFile: `${req.file.path}`,
            sheets: [{
                name: 'Steps',
                columnToKey: {
                    A: 'index',
                    B: 'type',
                    C: 'prompt',
                    D: 'response',
                    E: 'labels'
                }
            }]
        })


        for (const key in result['Steps']) {
            let step = {}
            if (result['Steps'][key].type == 'Poll') {
                step.type = 'poll'
                step.labels = result['Steps'][key].labels.split(', ')
                step.responses = result['Steps'][key].response
                step.prompt = result['Steps'][key].prompt
                steps.push(step)
            } else if (result['Steps'][key].type == 'Quiz') {
                let nameQ = result['Steps'][key].prompt
                let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                let colToKeyObj = {
                    A: 'index',
                    B: 'question',
                    C: 'key'
                }
                let i = 0
                for (const letterI in letters) {
                    if (letters.charAt(letterI) != 'A' && letters.charAt(letterI) != 'B' && letters.charAt(letterI) != 'C') {
                        colToKeyObj[letters.charAt(letterI)] = letters.charAt(i)
                        i++
                    }
                }
                let quizLoad = excelToJson({
                    sourceFile: `${req.file.path}`,
                    sheets: [{
                        name: nameQ,
                        columnToKey: colToKeyObj
                    }]
                })
                let questionList = []
                for (let i = 1; i < quizLoad[nameQ].length; i++) {
                    let questionMaker = []

                    questionMaker.push(quizLoad[nameQ][i].question)
                    questionMaker.push(quizLoad[nameQ][i].key)
                    for (const letterI in letters) {
                        if (quizLoad[nameQ][i][letters.charAt(letterI)] != undefined) {
                            questionMaker.push(quizLoad[nameQ][i][letters.charAt(letterI)])
                        }
                    }
                    questionList.push(questionMaker)
                }
                step.type = 'quiz'
                step.questions = questionList
                steps.push(step)


            } else if (result['Steps'][key].type == 'Lesson') {
                nameL = result['Steps'][key].prompt
                let lessonLoad = excelToJson({
                    sourceFile: `${req.file.path}`,
                    sheets: [{
                        name: nameL,
                        columnToKey: {
                            A: 'header',
                            B: 'data'
                        }
                    }]
                })
                let lessonArr = []
                for (let i = 1; i < lessonLoad[nameL].length; i++) {
                    let lessonMaker = [lessonLoad[nameL][i].header]

                    let lessonContent = lessonLoad[nameL][i].data.split(', ')
                    for (let u = 0; u < lessonContent.length; u++) {
                        lessonMaker.push(lessonContent[u])
                    }
                    lessonArr.push(lessonMaker)
                }

                let dateConfig = new Date()

                step.type = 'lesson'
                step.date = `${dateConfig.getMonth() + 1}/${dateConfig.getDate()}/${dateConfig.getFullYear()}`
                step.lesson = lessonArr
                steps.push(step)
            }
        }

        cD[req.session.class].steps = steps
        console.log(cD[req.session.class].steps)
        res.redirect('/controlpanel')
    }


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
    let className = req.body.name.toLowerCase()
    function makeClass(key) {
        // Get the teachers session data ready to transport into new class
        var user = cD.noClass.students[req.session.user]
        // Remove teacher from old class
        delete cD.noClass.students[req.session.user]
        // Add class into the session data
        cD[key] = new Classroom(className, key)
        // Add the teacher to the newly created class
        cD[key].students[req.session.user] = user
        req.session.class = key

        res.redirect('/home')
    }
    // Checks if teacher is creating a new class or joining an old class
    //generates a 4 character key
    //this is used for students who want to enter a class
    if (submittionType == 'create') {
        let key = ''
        for (let i = 0; i < 4; i++) {
            let keygen = 'abcdefghijklmnopqrstuvwxyz123456789'
            let letter = keygen[Math.floor(Math.random() * keygen.length)]
            key += letter
        }
        // Add classroom to the database
        db.run(`INSERT INTO classroom(name, owner, key) VALUES(?, ?, ?)`,
            [className, req.session.user, key], (err) => {
                if (err) {
                    console.log(err)
                }
            })
        makeClass(key)
    } else {
        db.get(`SELECT key FROM classroom WHERE name=?`, [className], (err, classCode) => {
            if (err) {
                console.log(err)
            }
            console.log(classCode.key)
            makeClass(classCode.key)
        })
    }


})

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
    res.render('pages/help', {
        color: '"dark blue"',
        title: "Help"
    })
})

// I

// J

// K

// L

app.get('/previousLessons', isAuthenticated, (req, res) => {
    db.all(`SELECT * FROM lessons WHERE class=?`, cD[req.session.class].className, async (err, rows) => {
        if (err) {
            console.log(err)
        } else if (rows) {
            res.render('pages/previousLesson', {
                rows: rows,
                title: "Previous Lesson"
            })

        }

    })
})

app.post('/previousLessons', (req, res) => {
    let lesson = JSON.parse(req.body.data)
    console.log(lesson)
    res.render('pages/lesson', {
        lesson: lesson,
        title: "Today's Lesson"
    })
})
// This renders the login page
// It displays the title and the color of the login page of the formbar js
// It allows for the login to check if the user wants to login to the server
// This makes sure the lesson can see the students and work with them
app.get('/login', (req, res) => {
    res.render('pages/login', {
        title: 'Formbar',
        color: 'purple',
        redurl: '',
        api: ''
    })
})

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
    var passwordCrypt = encrypt(user.password)
    // Check whether user is logging in or signing up
    if (user.loginType == "login") {
        // Get the users login in data to verify password
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], async (err, rows) => {
            if (err) {
                console.log(err)
            }
            // Check if a user with that name was found in the database
            if (rows) {
                // Decrypt users password
                let tempPassword = decrypt(JSON.parse(rows.password))
                if (rows.username == user.username && tempPassword == user.password) {
                    // Add user to the session
                    cD.noClass.students[rows.username] = new Student(rows.username, rows.id, rows.permissions, rows.API)
                    // Add a cookie to transfer user credentials across site
                    req.session.user = rows.username
                    if (req.body.classKey) {
                        req.session.class = req.body.classKey
                        let checkJoin
                        try {
                            checkJoin = await joinClass(user.username, cD[req.body.classKey].key)
                            if (checkJoin) {
                                res.json({ login: true })
                            } else (
                                res.json({ login: false })
                            )
                        } catch (err) {
                            res.json({ login: false })
                        }

                    } else {
                        res.redirect('/')
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
        db.run(`INSERT INTO users(username, password, permissions, API) VALUES(?, ?, ?, ?)`,
            [user.username, JSON.stringify(passwordCrypt), 2, require('crypto').randomBytes(64).toString('hex')], (err) => {
                if (err) {
                    console.log(err)
                }
                console.log('Success')
            })
        // Find the user in which was just created to get the id of the user
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err)
            } else {
                // Add user to session
                cD.noClass.students[rows.username] = new Student(rows.username, rows.id, 2, rows.API)
                // Add the user to the session in order to transfer data between each page
                req.session.user = rows.username
                res.redirect('/')
            }

        })
    } else if (user.loginType == "guest") {

    } else if (user.loginType == "bot") {
        let apikey = req.body.apikey
        if (apikey) {
            if (req.body.classKey in cD) {
                req.session.api = apikey
                req.session.class = req.body.classKey
                res.json({ login: true })
            } else {
                res.json({ login: false })
            }
        } else {
            res.json({ login: false })
        }
    }
})

// M

// N

// O

// P


// Q



// R


// S

// selectclass
//Send user to the select class page
app.get('/selectclass', isLoggedIn, (req, res) => {
    res.render('pages/selectclass', {
        title: 'Select Class',
        color: '"dark blue"'
    })
})


//Adds user to a selected class, typically from the select class page
app.post('/selectclass', isLoggedIn, async (req, res) => {
    let code = req.body.key.toLowerCase()
    let checkComplete = await joinClass(req.session.user, code)
    if (checkComplete) {
        req.session.class = code
        res.redirect('/home')
    } else {
        res.send('No Open Class with that Name')
    }
})



app.get('/student', isLoggedIn, (req, res) => {
    console.log(cD[req.session.class].mode)
    //Poll Setup
    let user = {
        name: req.session.user,
        class: req.session.class
    }
    let posPollRes = cD[req.session.class].posPollResObj
    let answer = req.query.letter
    if (answer) {
        cD[req.session.class].students[req.session.user].pollRes = answer
        db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
    }
    //Quiz Setup and Queries
    if (req.query.question == 'random') {
        let random = Math.floor(Math.random() * cD[req.session.class].quizObj.questions.length)
        res.render('pages/queryquiz', {
            quiz: JSON.stringify(cD[req.session.class].quizObj.questions[random]),
            title: "Quiz"
        })

    } else if (isNaN(req.query.question) == false) {
        if (cD[req.session.class].quizObj.questions[req.query.question] != undefined) {
            res.render('pages/queryquiz', {
                quiz: JSON.stringify(cD[req.session.class].quizObj.questions[req.query.question]),
                title: "Quiz"
            })

        } else {
            res.send('Please enter proper data')
        }

    } else if (req.query.question == undefined) {
        res.render('pages/student', {
            title: 'Student',
            color: '"dark blue"',
            user: JSON.stringify(user),
            pollStatus: cD[req.session.class].pollStatus,
            posPollRes: JSON.stringify(posPollRes),
            posTextRes: cD[req.session.class].posTextRes,
            pollPrompt: cD[req.session.class].pollPrompt,
            quiz: JSON.stringify(cD[req.session.class].quizObj),
            lesson: cD[req.session.class].lesson,
            mode: cD[req.session.class].mode
        })

    }
})
app.post('/student', (req, res) => {
    if (req.query.poll) {
        let answer = req.body.poll
        if (answer) {
            cD[req.session.class].students[req.session.user].pollRes = answer
            db.get('UPDATE users SET pollRes = ? WHERE username = ?', [answer, req.session.user])
        }
        res.redirect('/poll')
    }
    if(req.body.question){
        let results = req.body.question
        let totalScore = 0
        for (let i = 0; i < cD[req.session.class].quizObj.questions.length; i++) {
            if (results[i] == cD[req.session.class].quizObj.questions[i][1]) {
                totalScore += cD[req.session.class].quizObj.pointsPerQuestion
            } else {
                continue
            }
        }
        cD[req.session.class].students[req.session.user].quizScore = Math.floor(totalScore) + '/' + cD[req.session.class].quizObj.totalScore
        
        res.render('pages/results', {
            totalScore: Math.floor(totalScore),
            maxScore: cD[req.session.class].quizObj.totalScore,
            title: "Results"
        })
    }
})




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
    let api = req.query.api
    res.render('pages/login', {
        title: 'Formbar',
        color: 'purple',
        redurl: redurl,
        api: api
    })
})

app.post('/oauth/login', (req, res) => {
    let redurl = req.body.redurl
    let api = req.body.api
    var user = {
        username: req.body.username,
        password: req.body.password,
        loginType: req.body.loginType,
        userType: req.body.userType
    }
    var passwordCrypt = encrypt(user.password)
    // Check whether user is logging in or signing up
    if (user.loginType == "login") {
        // Get the users login in data to verify password
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], async (err, rows) => {
            if (err) {
                console.log(err)
            }
            // Check if a user with that name was found in the database
            if (rows) {
                // Decrypt users password
                let tempPassword = decrypt(JSON.parse(rows.password))
                if (rows.username == user.username && tempPassword == user.password) {
                    let token = generateAccessToken({ username: user.username, permissions: rows.permissions }, api)
                    console.log(redurl + "?token=" + token)
                    res.redirect(redurl + "?token=" + token)
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
                    console.log(err)
                }
                console.log('Success')
            })
        // Find the user in which was just created to get the id of the user
        db.get(`SELECT * FROM users WHERE username=?`, [user.username], (err, rows) => {
            if (err) {
                console.log(err)
            }
            // Add user to session
            cD.noClass.students[rows.username] = new Student(rows.username, rows.id)
            // Add the user to the session in order to transfer data between each page
            req.session.user = rows.username
            res.redirect('/')

        })
    }
})


// Middleware for sockets
// Authentication for users and bots to connect to formbar websockets
// The user must be logged in order to connect to websockets
io.use((socket, next) => {
    if (socket.request.session.user) {
        next()
    } else if (socket.request.session.api) {
        next()
    } else {
        console.log("Authentication Failed")
        next(new Error("invalid"))
    }
})

const rateLimits = {}

//Handles the websocket communications
io.sockets.on('connection', function (socket) {
    if (socket.request.session.user) {
        socket.join(cD[socket.request.session.class].className)
    } else if (socket.request.session.api) {
        socket.join(cD[socket.request.session.class].className)
    }

    //rate limiter
    socket.use((packet, next) => {
        const user = socket.request.session.user
        const now = Date.now()
        const limit = 5
        const timeFrame = 3000
        const blockTime = 3000
        const allowedRequests = ['pollResp', 'help', 'break']

        if (!rateLimits[user]) {
            rateLimits[user] = {}
        }

        const userRequests = rateLimits[user]

        const requestType = packet[0]
        if (!allowedRequests.includes(requestType)) {
            next()
            return
        }

        userRequests[requestType] = userRequests[requestType] || []

        userRequests[requestType] = userRequests[requestType].filter((timestamp) => now - timestamp < timeFrame)

        if (userRequests[requestType].length >= limit) {
            setTimeout(() => {
                userRequests[requestType].shift()
            }, blockTime)
        } else {
            userRequests[requestType].push(now)
            next()
        }
    })

    // /poll websockets for updating the database
    socket.on('pollResp', function (res, textRes) {
        cD[socket.request.session.class].students[socket.request.session.user].pollRes = res
        cD[socket.request.session.class].students[socket.request.session.user].pollTextRes = textRes
        db.get('UPDATE users SET pollRes = ? WHERE username = ?', [res, socket.request.session.user])
    })
    // Changes Permission of user. Takes which user and the new permission level
    socket.on('permChange', function (user, res) {
        cD[socket.request.session.class].students[user].permissions = res
        db.get('UPDATE users SET permissions = ? WHERE username = ?', [res, user])
    })
    // Starts a new poll. Takes the number of responses and whether or not their are text responses
    socket.on('startPoll', function (resNumber, resTextBox, pollPrompt, answerNames) {
        cD[socket.request.session.class].mode = 'poll'
        cD[socket.request.session.class].pollStatus = true
        // Creates an object for every answer possible the teacher is allowing
        for (let i = 0; i < resNumber; i++) {
            console.log(answerNames)
            if (answerNames[i] == '' || answerNames[i] == null) {
                let letterString = "abcdefghijklmnopqrstuvwxyz"
                cD[socket.request.session.class].posPollResObj[letterString[i]] = 'answer ' + letterString[i]
            } else {
                cD[socket.request.session.class].posPollResObj[answerNames[i]] = answerNames[i]
            }
        }
        cD[socket.request.session.class].posTextRes = resTextBox
        cD[socket.request.session.class].pollPrompt = pollPrompt
    })
    // End the current poll. Does not take any arguments
    socket.on('endPoll', function () {
        let data = { prompt: '', names: [], letter: [], text: [] }

        let dateConfig = new Date()
        let date = `${dateConfig.getMonth() + 1}.${dateConfig.getDate()}.${dateConfig.getFullYear()}`

        data.prompt = cD[socket.request.session.class].pollPrompt
        for (const key in cD[socket.request.session.class].students) {
            data.names.push(cD[socket.request.session.class].students[key].username)
            data.letter.push(cD[socket.request.session.class].students[key].pollRes)
            data.text.push(cD[socket.request.session.class].students[key].pollTextRes)
        }

        db.run(`INSERT INTO poll_history(class, data, date) VALUES(?, ?, ?)`,
            [cD[socket.request.session.class].key, JSON.stringify(data), date], (err) => {
                if (err) {
                    console.log(err)
                }
                console.log('Saved Poll To Database')
            })

        cD[socket.request.session.class].posPollResObj = {}
        cD[socket.request.session.class].pollPrompt = ''
        cD[socket.request.session.class].pollStatus = false

        for (const key in cD[socket.request.session.class].students) {
            cD[socket.request.session.class].students[key].pollRes = ""
            cD[socket.request.session.class].students[key].pollTextRes = ""
        }

        socket.broadcast.emit('vbData')
    })
    // Reloads any page with the reload function on. No arguments
    socket.on('reload', function () {
        io.emit('reload')
    })
    // Sends poll and student response data to client side virtual bar
    socket.on('vbData', function () {
        io.to(cD[socket.request.session.class].className).emit('vbData', JSON.stringify(cD[socket.request.session.class]))
    })

    socket.on('help', function (reason, time) {
        cD[socket.request.session.class].students[socket.request.session.user].help = { reason: reason, time: time }
    })
    socket.on('break', () => {
        studentBreak = cD[socket.request.session.class].students[socket.request.session.user]
        if (studentBreak.break)
            studentBreak.break = false
        else studentBreak.break = true
    })
    socket.on('deleteUser', function (userName) {
        cD.noClass.students[userName] = cD[socket.request.session.class].students[userName]
        delete cD[socket.request.session.class].students[userName]
        console.log(userName + ' removed from class')
    })
    socket.on('joinRoom', function (className) {
        console.log("Working")
        socket.join(className)
    })
    socket.on('cpupdate', function () {
        db.all(`SELECT * FROM poll_history WHERE class=?`, cD[socket.request.session.class].key, async (err, rows) => {
            var pollHistory = rows
            io.to(cD[socket.request.session.class].className).emit('cpupdate', JSON.stringify(cD[socket.request.session.class]), JSON.stringify(pollHistory))
        })

    })
    // socket.on('sfxGet', function () {
    //     io.to(cD[socket.request.session.class].className).emit('sfxGet')
    // })
    // socket.on('sfxLoad', function (sfxFiles) {
    //     io.to(cD[socket.request.session.class].className).emit('sfxLoadUpdate', sfxFiles.files, sfxFiles.playing)
    // })
    // socket.on('sfxPlay', function (music) {
    //     io.to(cD[socket.request.session.class].className).emit('sfxPlay', music)
    // })
    socket.on('botPollStart', function (answerNumber) {
        answerNames = []
        cD[socket.request.session.class].pollStatus = true
        // Creates an object for every answer possible the teacher is allowing
        for (let i = 0; i < answerNumber; i++) {
            if (answerNames[i] == '' || answerNames[i] == null) {
                let letterString = "abcdefghijklmnopqrstuvwxyz"
                cD[socket.request.session.class].posPollResObj[letterString[i]] = 'answer ' + letterString[i]
            } else {
                cD[socket.request.session.class].posPollResObj[answerNames[i]] = answerNames[i]
            }
        }
        cD[socket.request.session.class].posTextRes = false
        cD[socket.request.session.class].pollPrompt = "Quick Poll"
    })
    socket.on('previousPollDisplay', function (pollindex) {

        db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, function (err, pollData) {
            if (err) {
                console.error(err)
            } else {
                io.to(cD[socket.request.session.class].className).emit('previousPollData', JSON.parse(pollData.data))
            }
        })

    })
    socket.on('doStep', function (index) {
        io.to(cD[socket.request.session.class].className).emit('reload')
        cD[socket.request.session.class].currentStep++
        if (cD[socket.request.session.class].steps[index] !== undefined) {
            if (cD[socket.request.session.class].steps[index].type == 'poll') {

                cD[socket.request.session.class].mode = 'poll'

                if (cD[socket.request.session.class].pollStatus == true) {
                    cD[socket.request.session.class].posPollResObj = {}
                    cD[socket.request.session.class].pollPrompt = ""
                    cD[socket.request.session.class].pollStatus = false
                };

                cD[socket.request.session.class].pollStatus = true
                // Creates an object for every answer possible the teacher is allowing
                for (let i = 0; i < cD[socket.request.session.class].steps[index].responses; i++) {
                    if (cD[socket.request.session.class].steps[index].labels[i] == '' || cD[socket.request.session.class].steps[index].labels[i] == null) {
                        let letterString = "abcdefghijklmnopqrstuvwxyz"
                        cD[socket.request.session.class].posPollResObj[letterString[i]] = 'answer ' + letterString[i]
                    } else {
                        cD[socket.request.session.class].posPollResObj[cD[socket.request.session.class].steps[index].labels[i]] = cD[socket.request.session.class].steps[index].labels[i]
                    }
                }
                cD[socket.request.session.class].posTextRes = false
                cD[socket.request.session.class].pollPrompt = cD[socket.request.session.class].steps[index].prompt
            } else if (cD[socket.request.session.class].steps[index].type == 'quiz') {
                cD[socket.request.session.class].mode = 'quiz'
                questions = cD[socket.request.session.class].steps[index].questions
                quiz = new Quiz(questions.length, 100)
                quiz.questions = questions
                cD[socket.request.session.class].quizObj = quiz

            } else if (cD[socket.request.session.class].steps[index].type == 'lesson') {
                cD[socket.request.session.class].mode = 'lesson'
                let lesson = new Lesson(cD[socket.request.session.class].steps[index].date, cD[socket.request.session.class].steps[index].lesson)
                cD[socket.request.session.class].lesson = lesson


                db.run(`INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)`,
                    [cD[socket.request.session.class].className, JSON.stringify(cD[socket.request.session.class].lesson), cD[socket.request.session.class].lesson.date], (err) => {
                        if (err) {
                            console.log(err)

                        }
                    })
                cD[socket.request.session.class].posTextRes = false
                cD[socket.request.session.class].pollPrompt = cD[socket.request.session.class].steps[index].prompt
            } else if (cD[socket.request.session.class].steps[index].type == 'quiz') {
                questions = cD[socket.request.session.class].steps[index].questions
                quiz = new Quiz(questions.length, 100)
                quiz.questions = questions
                cD[socket.request.session.class].quizObj = quiz

            } else if (cD[socket.request.session.class].steps[index].type == 'lesson') {

                let lesson = new Lesson(cD[socket.request.session.class].steps[index].date, cD[socket.request.session.class].steps[index].lesson)
                cD[socket.request.session.class].lesson = lesson


                db.run(`INSERT INTO lessons(class, content, date) VALUES(?, ?, ?)`,
                    [cD[socket.request.session.class].className, JSON.stringify(cD[socket.request.session.class].lesson), cD[socket.request.session.class].lesson.date], (err) => {
                        if (err) {
                            console.log(err)
                        }
                        console.log('Saved Lesson To Database')
                    })

            }
        } else {
            cD[socket.request.session.class].currentStep = 0
        }
    })
    socket.on('previousPollDisplay', function (pollindex) {
        db.get('SELECT data FROM poll_history WHERE id = ?', pollindex, function (err, pollData) {
            if (err) {
                console.error(err)
            } else {
                io.to(cD[socket.request.session.class].className).emit('previousPollData', JSON.parse(pollData.data))
            }
        })
    })
    socket.on('deleteTicket', function (student) {
        cD[socket.request.session.class].students[student].help = ''
    })
    socket.on('modechange', function (mode) {
        cD[socket.request.session.class].mode = mode

        io.to(cD[socket.request.session.class].className).emit('reload')
    })
})




http.listen(420, () => {
    console.log('Running on port: 420')
})

