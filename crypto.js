//
// Slow Hashing with salt
//
const bcrypt = require('bcrypt');

// Increases time to log in/verify
const saltRounds = 1;

// Returns a promise with the hash and salt
// Use .then on hash with functions resolve(value) and reject(err) to get values
// W3Schools taught me how to use promises, likely not the best way to do it
const hash = (text) => {
    return new Promise((resolve, reject) => {
        bcrypt.genSalt(saltRounds, (err, salt) => {
            if (err) {
                reject(err);
                return;
            }
            bcrypt.hash(text, salt, (err, hash) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ hash, salt });
                return;
            });
        });
    });
};

// Returns true if the two values match, hash is the database value
const compare = (text, hash) => {
    bcrypt.compare(text, hash, (err, res) => {
        if (err) {
            return;
        }
        return res;
    });
}

module.exports = {
    hash,
    compare
};