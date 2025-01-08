const excelToJson = require("convert-excel-to-json")
const multer = require('multer') // Used to upload files
const upload = multer({ dest: 'uploads/' }) // Selects a file destination for uploaded files to go to, will create folder when file is submitted(?)
const { isAuthenticated, permCheck, isVerified } = require("../modules/authentication")
const { classInformation } = require("../modules/class")
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        // An endpoint for the teacher to control the formbar
        // Used to update students permissions, handle polls and their corresponsing responses
        // On render it will send all students in that class to the page
        app.get('/controlPanel', isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log('info', `[get /controlPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                let students = classInformation.classrooms[req.session.classId].students
                let keys = Object.keys(students)
                let allStuds = []

                for (let i = 0; i < keys.length; i++) {
                    const val = { name: keys[i], perms: students[keys[i]].permissions, pollRes: { lettRes: students[keys[i]].pollRes.buttonRes, textRes: students[keys[i]].pollRes.textRes }, help: students[keys[i]].help }
                    allStuds.push(val)
                }

                /* Uses EJS to render the template and display the information for the class.
                This includes the class list of students, poll responses, and the class code - Riley R., May 22, 2023
                */
                res.render('pages/controlPanel', {
                    title: 'Control Panel',
                    pollStatus: classInformation.classrooms[req.session.classId].poll.status,
                    settingsPermissions: classInformation.classrooms[req.session.classId].permissions.manageClass,
                    tagNames: classInformation.classrooms[req.session.classId].tagNames
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        /*
        Manages the use of excell spreadsheets in order to create progressive lessons.
        It uses Excel To JSON to create an object containing all the data needed for a progressive lesson.
        Could use a switch if need be, but for now it's all broken up by if statements.
        Use the provided template when testing things. - Riley R., May 22, 2023
        */
        app.post('/controlPanel', upload.single('spreadsheet'), isAuthenticated, permCheck, (req, res) => {
            try {
                //Initialze a list to push each step to - Riley R., May 22, 2023
                let steps = []

                logger.log('info', `[post /controlPanel] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                /*
                Uses Excel to JSON to read the sent excel spreadsheet.
                Each main column has been assigned a label in order to differentiate them.
                It loops through the whole object - Riley R., May 22, 2023
                */
                if (req.file) {
                    classInformation.classrooms[req.session.classId].currentStep = 0
                    const result = excelToJson({
                        sourceFile: req.file.path,
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

                    /* For In Loop that iterates through the created object.
                    Allows for the use of steps inside of a progressive lesson.
                    Checks the object's type using a conditional - Riley R., May 22, 2023
                    */
                    for (const key in result['Steps']) {
                        let step = {}
                        // Creates an object with all the data required to start a poll - Riley R., May 22, 2023
                        if (result['Steps'][key].type == 'Poll') {
                            step.type = 'poll'
                            step.labels = result['Steps'][key].labels.split(', ')
                            step.responses = result['Steps'][key].response
                            step.prompt = result['Steps'][key].prompt
                            steps.push(step)
                            // Creates an object with all the data required to start a quiz
                        } else if (result['Steps'][key].type == 'Quiz') {
                            let nameQ = result['Steps'][key].prompt
                            let letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                            let colToKeyObj = {
                                A: 'index',
                                B: 'question',
                                C: 'key'
                            }
                            let i = 0
                            /*
                            Names the cells of the sheet after C to A-Z for the use of them in Quizzes (A, B, and C in the spreadsheet are the index, question, and key, not the answers)
                            Creates a way to have multiple responses to quizzes- Riley R., May 22, 2023
                            */
                            for (const letterI in letters) {
                                if (letters.charAt(letterI) != 'A' && letters.charAt(letterI) != 'B' && letters.charAt(letterI) != 'C') {
                                    colToKeyObj[letters.charAt(letterI)] = letters.charAt(i)
                                    i++
                                }
                            }
                            let quizLoad = excelToJson({
                                sourceFile: req.file.path,
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
                            /*
                            Creates an object with all necessary data in order to make a lesson.
                            The data is stored on a page in an excel spreadsheet.
                            the name of this page is defined in the main page of the excel spreadsheet. - Riley R., May 22, 2023
                            */
                            nameL = result['Steps'][key].prompt
                            let lessonLoad = excelToJson({
                                sourceFile: req.file.path,
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

                    classInformation.classrooms[req.session.classId].steps = steps
                    res.redirect('/controlPanel')
                }
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })        
    }
}