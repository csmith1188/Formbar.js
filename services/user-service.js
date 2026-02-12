const handlebars = require("handlebars");
const fs = require("fs");
const { sendMail } = require("@modules/mail");
const { dbGet, dbRun } = require("@modules/database");
const { frontendUrl } = require("@modules/config");
const { hash } = require("bcrypt");
const crypto = require("crypto");
const AppError = require("@errors/app-error");
const NotFoundError = require("@errors/not-found-error");

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
        throw new AppError("Failed to load password reset email template.", { statusCode: 500, event: "user.password.reset.failed", reason: "template_load_error" });
    }
}

async function getUserData(userId) {
    const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
    return user;
}

async function requestPasswordReset(email) {
    const template = loadPasswordResetTemplate();
    const secret = crypto.randomBytes(256).toString("hex");
    await dbRun("UPDATE users SET secret = ? WHERE email = ?", [secret, email]);

    sendMail(email, "Formbar Password Change", template({ resetUrl: `${frontendUrl}/user/me/password?code=${secret}` }));
}

async function resetPassword(password, token) {
    const user = await dbGet("SELECT * FROM users WHERE secret = ?", [token]);
    if (!user) {
        throw new NotFoundError("Password reset token is invalid or has expired.", { event: "user.password.reset.failed", reason: "invalid_token" });
    }

    const hashedPassword = await hash(password, 10);
    await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, user.id]);
    return true;
}

module.exports = {
    getUserData,
    requestPasswordReset,
    resetPassword,
};
