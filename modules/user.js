const { classInformation } = require('./class/classroom')
const { database, dbGetAll, dbGet, dbRun } = require('./database')
const { logger } = require('./logger')
const { userSockets, managerUpdate } = require("./socketUpdates");
const { userSocketUpdates } = require("../sockets/init");
const { deleteRooms } = require("./class/class");
const { deleteCustomPolls } = require("./polls");

/**
 * Asynchronous function to get the current user's data.
 * @param {Object} api - The API key for the user.
 * @returns {Promise|Object} A promise that resolves to the user's data or an error object.
 */
async function getUser(api) {
    try {
        // Log the request details
        logger.log('info', `[getUser]`)

        // Get the email associated with the API key in the request headers
        let email = await getEmailFromAPIKey(api)

        // If the email is an instance of Error, throw the error
        if (email instanceof Error) throw email
        
        // If an error occurs, return the error
        if (email.error) return email

        // Get the class code of the user
        let classId = getUserClass(email)

        // If the class code is an instance of Error, throw the error
        if (classId instanceof Error) throw classId

        // Query the database for the user's data
        let dbUser = await new Promise((resolve, reject) => {
            // If the user is not in any class
            if (!classId) {
                // Query the database for the user's data
                database.get(
                    'SELECT id, email, permissions, NULL AS classPermissions FROM users WHERE email = ?',
                    [email],
                    (err, dbUser) => {
                        try {
                            // If an error occurs, throw the error
                            if (err) throw err

                            // If no user is found, resolve the promise with an error object
                            if (!dbUser) {
                                resolve({ error: 'user does not exist' })
                                return
                            }

                            // If a user is found, resolve the promise with the user object
                            resolve(dbUser)
                        } catch (err) {
                            // If an error occurs, reject the promise with the error
                            reject(err)
                        }
                    }
                )
                return
            }

            // If the user is in a class, query the database for the user's data and class permissions
            database.get(
                'SELECT users.id, users.email, users.permissions, CASE WHEN users.id = classroom.owner THEN 5 ELSE classusers.permissions END AS classPermissions FROM users JOIN classroom ON classroom.id = ? LEFT JOIN classusers ON classusers.classId = classroom.id AND classusers.studentId = users.id WHERE users.email = ?;',
                [classId, email],
                (err, dbUser) => {
                    try {
                        // If an error occurs,g throw the error
                        if (err) throw err

                        // If no user is found, resolve the promise with an error object
                        if (!dbUser) {
                            resolve({ error: 'user does not exist in this class' })
                            return
                        }

                        // If a user is found, resolve the promise with the user object
                        resolve(dbUser)
                    } catch (err) {
                        // If an error occurs, reject the promise with the error
                        reject(err)
                    }
                }
            )
        })
        
        // If an error occurs, return the error
        if (dbUser.error) return dbUser

        // Create an object to store the user's data
        let userData = {
            loggedIn: false,
            ...dbUser,
            help: null,
            break: null,
            pogMeter: 0,
            classId: classId
        }

        // If the user is in a class and is logged in
        if (classInformation.classrooms[classId] && classInformation.classrooms[classId].students[dbUser.email]) {
            let cdUser = classInformation.classrooms[classId].students[dbUser.email]
            if (cdUser) {
                // Update the user's data with the data from the class
                userData.loggedIn = true
                userData.help = cdUser.help
                userData.break = cdUser.break
                userData.pogMeter = cdUser.pogMeter
            }
        }

        // Log the user's data
        logger.log('verbose', `[getUser] userData=(${JSON.stringify(userData)})`)

        // Return the user's data
        return userData
    } catch (err) {
        // If an error occurs, return the error
        return err
    }
}

async function deleteUser(userId, userSession) {
    try {
        logger.log('info', `[deleteUser] session=(${JSON.stringify(userSession)})`)
        logger.log('info', `[deleteUser] userId=(${userId})`)

        // Get the user's email from their ID and verify they exist
        const user = await dbGet('SELECT * FROM users WHERE id=?', [userId]);
        if (!user) {
            return 'User not found'
        }

        // Log the user out if they're currently online
        const userSocketsMap = userSockets[user.email];
        const usersSocketUpdates = userSocketUpdates[user.email];
        if (userSocketsMap && usersSocketUpdates) {
            const anySocket = Object.values(userSocketsMap)[0];
            if (anySocket) {
                usersSocketUpdates.logout(anySocket);
            }
        }

        try {
            await dbRun('BEGIN TRANSACTION')
            await Promise.all([
                dbRun('DELETE FROM users WHERE id=?', userId),
                dbRun('DELETE FROM classusers WHERE studentId=?', userId),
                dbRun('DELETE FROM shared_polls WHERE userId=?', userId),
            ])

            // await userSocketUpdates.deleteCustomPolls(userId)
            await deleteCustomPolls(userId)
            await deleteRooms(userId) // Delete any rooms owned by the user

            // If the student is online, remove them from any class they're in and update the control panel
            const student = classInformation.users[user.email];
            if (student) {
                const activeClass = classInformation.users[user.email].activeClass;
                const classroom = classInformation.classrooms[activeClass];
                delete classInformation.users[user.email];
                if (classroom) {
                    delete classroom.students[user.email];
                    userSocketUpdates.classUpdate();
                }
            }

            await dbRun('COMMIT')
            await managerUpdate()
            return true
        } catch (err) {
            await dbRun('ROLLBACK')
            throw err
        }
    } catch (err) {
        logger.log('error', err.stack);
        return 'There was an internal server error. Please try again.';
    }
}

/**
 * Gets the classes a user owns from their email.
 * @param email
 * @param userSession
 */
async function getUserOwnedClasses(email, userSession) {
    logger.log('info', `[getOwnedClasses] session=(${JSON.stringify(userSession)})`);
    logger.log('info', `[getOwnedClasses] email=(${email})`);

    const userId = (await dbGet('SELECT id FROM users WHERE email = ?', [email])).id;
    return await dbGetAll('SELECT * FROM classroom WHERE owner=?', [userId]);
}

/**
 * Retrieves the class id for a given user.
 *
 * @param {string} email - The email of the user.
 * @returns {string|null|Error} The class id if the user is found, null if the user is not found, or an Error object if an error occurs.
 */
function getUserClass(email) {
	try {
		// Log the email
		logger.log('info', `[getUserClass] email=(${email})`);

        // Iterate over the classrooms to find which class the user is in
        for (const classroomId in classInformation.classrooms) {
            const classroom = classInformation.classrooms[classroomId];
            if (classroom.students[email]) {
                // Log the class id
                logger.log('verbose', `[getUserClass] classId=(${classInformation.id})`);

                // Return the class code
                return classroom.id;
            }
        }

		// If the user is not found in any class, log null
		logger.log('verbose', `[getUserClass] classId=(${null})`);

		// Return null
		return null;
	} catch (err) {
		// If an error occurs, return the error
		return err
	}
}

/**
 * Asynchronous function to get the email associated with a given API key.
 * @param {string} api - The API key.
 * @returns {Promise<string|Object>} A promise that resolves to the email or an error object.
 */
async function getEmailFromAPIKey(api) {
    try {
        // If no API key is provided, return an error
        if (!api) return { error: 'Missing API key' }

        // Query the database for the email associated with the API key
        let user = await new Promise((resolve, reject) => {
            database.get(
                'SELECT email FROM users WHERE api = ?',
                [api],
                (err, user) => {
                    try {
                        // If an error occurs, throw the error
                        if (err) throw err

                        // If no user is found, resolve the promise with an error object
                        if (!user) {
                            resolve({ error: 'User not found' })
                            return
                        }

                        // If a user is found, resolve the promise with the user object
                        resolve(user)
                    } catch (err) {
                        // If an error occurs, reject the promise with the error
                        reject(err)
                    }
                }
            )
        })

        // If an error occurred, return the error
        if (user.error) return user

        // If no error occurred, return the email
        return user.email
    } catch (err) {
        // If an error occurs, return the error
        return err
    }
}

module.exports = {
    getUser,
    deleteUser,
    getUserOwnedClasses,
    getUserClass
}