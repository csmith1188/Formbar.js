// Import the nodemailer module
const nodemailer = require('nodemailer');
// Import the dotenv module
require('dotenv').config();

// Access the email password from the environmental variable
const emailPassword = process.env.EMAIL_PASSWORD;

// Create a function for sending mail, passing the recipient, subject, and HTML content as arguments
const sendMail = (recipient, subject, html) => {
    // Configure the SMTP transport
    const smtpConfig = {
        service: 'dreamhost',
        host: 'smtp.dreamhost.com',
        port: 465,
        secure: true,
        // The email and password to the email the SMTP server will use
        auth: {
            user: 'automailer@yorktechapps.com',
            pass: emailPassword, // Must be fixed at a later date
        }
    };

    // Create the transporter using the smtpConfig
    const transporter = nodemailer.createTransport(smtpConfig);

    // Create a mailOptions object
    // This object will contain the information for the email
    const mailOptions = {
        from: 'automailer@yorktechapps.com',
        to: recipient,
        subject: subject,
        html: html
    };

    // Sends the mail through the transporter, catching any errors that may arise
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Error sending email: ", error);
        } else {
            console.log("Email sent: ", info.response);
        };
    });
}

module.exports = {
    sendMail: sendMail
}