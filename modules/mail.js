const nodemailer = require('nodemailer');

// Create a function for sending mail, passing the recipient, subject, and HTML content as arguments
const sendMail = (fbMail, fbPass, recipient, subject, html) => {
    // Configure the SMTP transport
    const smtpConfig = {
        service: 'office365',
        host: 'smtp.office365.com',
        port: 465,
        secure: true,
        // The email and password to the email the SMTP server will use
        auth: {
            user: fbMail,
            pass: fbPass
        }
    };

    // Create the transporter using the smtpConfig
    const transporter = nodemailer.createTransport(smtpConfig);

    // Create a mailOptions object
    // This object will contain the information for the email
    const mailOptions = {
        from: fbMail,
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