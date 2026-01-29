const nodemailer = require("nodemailer");
const { settings } = require("./config");
const { logger } = require("./logger");

// Create a map to store the email rate limits
const limitStore = new Map();
const RATE_LIMIT = 60000; // 1 minute in milliseconds

/**
 * Send an email via SMTP.
 * Applies per-recipient rate limiting.
 * @param {string} recipient - Recipient email address.
 * @param {string} subject - Email subject.
 * @param {string} html - HTML content of the message.
 * @returns {void}
 */
function sendMail(recipient, subject, html) {
    // If email is not enabled in the settings, return
    if (!settings.emailEnabled) return;

    // Get the email user and password from the environment variable
    // If the email user or password is not set, return
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailUser = process.env.EMAIL_USER;
    if (!emailPassword || !emailUser) return;

    // Get the current time
    // Check if the user has sent an email within the specified time period
    const currentTime = Date.now();
    if (limitStore.has(recipient) && currentTime - limitStore.get(recipient) < RATE_LIMIT) {
        return;
    }

    // Configure the SMTP transport
    const smtpConfig = {
        service: "dreamhost",
        host: "smtp.dreamhost.com",
        port: 465,
        secure: true,
        // The email and password to the email the SMTP server will use
        auth: {
            user: emailUser,
            pass: emailPassword,
        },
    };

    // Create the transporter using the smtpConfig and store the information for the email
    const transporter = nodemailer.createTransport(smtpConfig);
    const mailOptions = {
        from: emailUser,
        to: recipient,
        subject: subject,
        html: html,
    };

    // Sends the mail through the transporter, and adds the recipient to the limitStore
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Error sending email:", error);
        } else {
            // Log email and store the current time for the recipient
            limitStore.set(recipient, currentTime);
        }
    });
}

// Export the sendMail function
module.exports = {
    sendMail,
    limitStore,
    RATE_LIMIT,
};
