const { database, dbGetAll} = require("./database");
const jwt = require('jsonwebtoken');

async function getManagerData() {
    const [users, classrooms] = await Promise.all([
        new Promise((resolve, reject) => {
            database.all('SELECT id, email, permissions, displayName, verified FROM users', (err, users) => {
                if (err) reject(new Error(err))
                else {
                    users = users.reduce((tempUsers, tempUser) => {
                        tempUsers[tempUser.email] = tempUser
                        return tempUsers
                    }, {})
                    resolve(users)
                }
            })
        }),
        new Promise((resolve, reject) => {
            database.get('SELECT * FROM classroom', (err, classrooms) => {
                if (err) reject(new Error(err))
                else resolve(classrooms)
            })
        })
    ]);

    // Grab the unverified users from the database and insert them into the user data
    const tempUsers = await dbGetAll('SELECT * FROM temp_user_creation_data');
    for (const tempUser of tempUsers) {
        // Grab the token, decode it, and check if they're already accounted for in the users table
        const token = tempUser.token;
        const decodedData = jwt.decode(token);
        if (users[decodedData.email]) {
            continue;
        }

        users[decodedData.newSecret] = {
            id: decodedData.newSecret,
            email: decodedData.email,
            permissions: decodedData.permissions,
            displayName: decodedData.displayName,
            verified: false
        }
    }

    return { users, classrooms };
}

module.exports = { getManagerData }