const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a map to store the email rate limits
const limitStore = new Map();
const RATE_LIMIT = 60 * 1000; // 1 minute

// Create a function for sending mail, passing the recipient, subject, and HTML content as arguments
const sendMail = (recipient, subject, html) => {
    // Access the email user and password from the environmental variable
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailUser = process.env.EMAIL_USER;
    // If the email user or password is not set, return
    if (!emailPassword || !emailUser) return;
    // Get the current time
    const currentTime = Date.now();
    // Check if the user has sent an email within the specified time period
    if (limitStore.has(recipient) && (currentTime - limitStore.get(recipient) < RATE_LIMIT)) {
        console.log(`Email rejected: ${recipient} exceeded rate limit`);
        return;
    }

    // Configure the SMTP transport
    const smtpConfig = {
        service: 'dreamhost',
        host: 'smtp.dreamhost.com',
        port: 465,
        secure: true,
        // The email and password to the email the SMTP server will use
        auth: {
            user: emailUser,
            pass: emailPassword 
        }
    };

    // Create the transporter using the smtpConfig
    const transporter = nodemailer.createTransport(smtpConfig);

    // Create a mailOptions object
    // This object will contain the information for the email
    const mailOptions = {
        from: emailUser,
        to: recipient,
        subject: subject,
        html: html
    };

    // Sends the mail through the transporter, and adds the recipient to the limitStore
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
            // Store the current time for the recipient
            limitStore.set(recipient, currentTime);
            return;
        };
    });
};

// Export the sendMail function
module.exports = {
    sendMail,
    limitStore,
    RATE_LIMIT
};