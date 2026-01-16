const { dbGet } = require("@modules/database");

async function getUserData(userId) {
    const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
    return user;
}

module.exports = {
    getUserData,
};
