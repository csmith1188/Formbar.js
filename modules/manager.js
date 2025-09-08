const { database } = require("./database");

async function getManagerData() {
    const [users, classrooms] = await Promise.all([
        new Promise((resolve, reject) => {
            database.all('SELECT id, email, permissions, displayName FROM users', (err, users) => {
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

    return { users, classrooms };
}

module.exports = { getManagerData }