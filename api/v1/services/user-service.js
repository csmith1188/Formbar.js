const { dbGet, dbGetAll } = require("@modules/database");

async function getUser(userId) {
    const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
    return user;
}

module.exports = {
    getUser
}