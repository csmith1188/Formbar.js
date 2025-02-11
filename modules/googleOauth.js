const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const fs = require('fs');

function setupGooglePassport() {
    // If the .env file does not exist, skip
    if (!fs.existsSync('.env') || !fs.readFileSync('.env').toString().includes('CLIENT_ID' || 'CLIENT_SECRET')) {
        return;
    };

    // Set up the google strategy using information from the .env file
    passport.use(new GoogleStrategy({
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: `${process.env.LOCATION}/auth/google/callback`
    }, (accessToken, refreshToken, profile, done) => {
        // This is called when the user is authenticated
        return done(null, profile);
    }));

    // Functions to serialize and deserialize the user if needed
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user, done) => {
        done(null, user);
    });
}

setupGooglePassport();
module.exports = {
    passport
};