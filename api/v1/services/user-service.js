const handlebars = require("handlebars");
const fs = require("fs");
const { sendMail } = require("@modules/mail");
const { dbGet, dbRun } = require("@modules/database");
const { frontendUrl } = require("@modules/config");
const { hash } = require("bcrypt");

let passwordResetTemplate;

function loadPasswordResetTemplate() {
    if (passwordResetTemplate) {
        return passwordResetTemplate;
    }

    try {
        const resetEmailContent = fs.readFileSync("email-templates/password-reset.hbs", "utf8");
        passwordResetTemplate = handlebars.compile(resetEmailContent);
        return passwordResetTemplate;
    } catch (err) {
        // Log the underlying error for diagnostics, but throw a controlled error outward.
        console.error("Failed to load password reset email template:", err);
        throw new Error("Failed to load password reset email template.");
    }
}

async function requestPasswordReset(email) {
    const { secret } = await dbGet("SELECT secret FROM users WHERE email = ?", [email]);
    if (!secret) {
        throw new Error("No user found with that email.");
    }

    const template = loadPasswordResetTemplate();
    sendMail(
        email,
        "Formbar Password Change",
        template({ resetUrl: `${frontendUrl}/user/me/password?code=${secret}&email=${email}` })
    );
}

async function resetPassword(password, token) {
    const user = await dbGet("SELECT * FROM users WHERE secret = ?", [token]);
    if (!user) {
        throw new Error("Invalid token.");
    }

    const hashedPassword = await hash(password, 10);
    await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, user.id]);
    return true;
}

module.exports = {
    requestPasswordReset,
    resetPassword,
};
