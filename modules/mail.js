// Import the nodemailer module
const nodemailer = require('nodemailer');
// Import the dotenv module
require('dotenv').config();

// Create a function for sending mail, passing the recipient, subject, and HTML content as arguments
const sendMail = (recipient, subject, html) => {
    // Access the email user and password from the environmental variable
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailUser = process.env.EMAIL_USER;
    // If the email user or password is not set, return
    if (!emailPassword || !emailUser) return;
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

    // Sends the mail through the transporter, catching any errors that may arise
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Error sending email: ", error);
        } else {
            console.log("Email sent: ", info.response);
        };
    });
};

// Export the sendMail function
module.exports = {
    sendMail: sendMail
};