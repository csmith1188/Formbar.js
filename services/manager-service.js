const { dbGetAll } = require("@modules/database");
const jwt = require("jsonwebtoken");

async function getManagerData() {
    //TODO DO NOT PUT ALL USERS IN MEMORY, THIS IS BAD, NEED TO PAGINATE OR SOMETHING
    const users = await dbGetAll("SELECT id, email, permissions, displayName, verified FROM users");
    const classrooms = await dbGetAll("SELECT * FROM classroom");

    // Grab the unverified users from the database and insert them into the user data
    const tempUsers = await dbGetAll("SELECT * FROM temp_user_creation_data");
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
            verified: false,
        };
    }

    return { users, classrooms };
}

module.exports = {
    getManagerData,
};
