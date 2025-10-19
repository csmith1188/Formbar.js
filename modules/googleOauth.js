const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { settings } = require("./config")

function setupGooglePassport() {
    // Check if google oauth is enabled
    if (!settings.googleOauthEnabled) return;
    // Set up the google strategy using information from the .env file
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback'
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