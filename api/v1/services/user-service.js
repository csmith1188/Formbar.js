const handlebars = require("handlebars");
const fs = require("fs")
const { sendMail } = require("@modules/mail");
const { dbGet, dbRun } = require("@modules/database");
const { frontendUrl } = require("@modules/config");

const resetEmailContent = fs.readFileSync("email-templates/password-reset.hbs", "utf8");
const passwordResetTemplate = handlebars.compile(resetEmailContent);

async function requestPasswordReset(email) {
    const { secret } = await dbGet("SELECT secret FROM users WHERE email = ?", [email]);
    if (!secret) {
        throw new Error("No user found with that email.");
    }

    sendMail(email, "Formbar Password Change", passwordResetTemplate({ resetUrl: `${frontendUrl}/user/me/password?code=${secret}&email=${email}` }));
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
