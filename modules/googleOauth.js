const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');

dotenv.config();

// Set up the google strategy using information from the .env file
passport.use(new GoogleStrategy({
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: `${process.env.LOCATION}/auth/google/callback`
    },
    // This function is called when the user is authenticated
    function(accessToken, refreshToken, profile, done) {
        return done(null, profile);
    }
));

// Functions to serialize and deserialize the user if needed
passport.serializeUser((user, done) => {
    done(null, user);
    }
);

passport.deserializeUser((user, done) => {
    done(null, user);
    }
);

module.exports = {
    passport
};