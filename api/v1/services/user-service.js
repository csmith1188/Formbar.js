const handlebars = require("handlebars");
const { sendMail } = require("@modules/mail");
const { dbGet, dbRun } = require("@modules/database");

const passwordResetTemplate = handlebars.compile("email-templates/password-reset.hbs");

async function requestPasswordReset(email) {
    const { secret } = await dbGet("SELECT secret FROM users WHERE email = ?", [email]);
    if (!secret) {
        throw new Error("No user found with that email.");
    }

    sendMail(
        email,
        "Formbar Password Change",
        passwordResetTemplate({ resetUrl: `${location}/user/me/password?code=${secret}&email=${email}` })
    );
}

async function resetPassword(password, token) {
    const user = await dbGet("SELECT * FROM users WHERE secret = ?", [token]);
    if (!user) {
        throw new Error("Invalid token.");
    }

    await dbRun("UPDATE users SET password = ? WHERE id = ?", [password, user.id]);
    return true;
}

module.exports = {
    requestPasswordReset,
    resetPassword,
};
