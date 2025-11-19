//
// Slow Hashing with salt
//
const bcrypt = require("bcrypt");

// Increases time to log in/verify
const saltRounds = parseInt(process.env.SALT_ROUNDS, 10) || 10;

/**
 * Generates a hash for the given text using bcrypt with a specified number of salt rounds.
 *
 * @param {string} text - The text to be hashed.
 * @returns {Promise<string>} A promise that resolves to the hashed text.
 */
const hash = (text) => {
    return new Promise((resolve, reject) => {
        // Validate that text is a string
        if (typeof text !== 'string') {
            reject(new Error('Text to hash must be a string'));
            return;
        }

        // Validate that text is not empty
        if (!text) {
            reject(new Error('Text to hash must be provided'));
            return;
        }

        bcrypt.genSalt(saltRounds, (err, salt) => {
            if (err) {
                reject(err);
            }

            bcrypt.hash(text, salt, (err, hash) => {
                if (err) {
                    reject(err);
                }
                resolve(hash);
            });
        });
    });
};

/**
 * Compares a given text with a hash to check if they match.
 *
 * @param {string} text - The text to be compared.
 * @param {string} hash - The hash to compare against.
 * @returns {Promise<boolean>} A promise that resolves to true if the text matches the hash, otherwise false.
 */
const compare = (text, hash) => {
    return new Promise((resolve, reject) => {
        // Validate that both text and hash are strings
        if (typeof text !== 'string' || typeof hash !== 'string') {
            reject(new Error('Both text and hash must be strings'));
            return;
        }

        // Validate that neither text nor hash is null or undefined
        if (!text || !hash) {
            reject(new Error('Both text and hash must be provided'));
            return;
        }

        bcrypt.compare(text, hash, (err, res) => {
            if (err) {
                reject(err);
            }
            resolve(res);
        });
    });
};

module.exports = {
    hash,
    compare,
};
