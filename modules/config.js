const fs = require('fs');
const crypto = require('crypto');
const { dbGet, dbRun } = require("./database");
require('dotenv').config();

/**
 * Generates a new RSA key pair and saves them to files.
 * Private and public keys are to be used to make Formbar OAuth more secure.
 * The private key is used to sign the data, and the public key is used to check the signature.
 * The public key is shared with the client, and the private key is kept secret on the server.
 * This way, users' applications can verify the JWT signature using the public key, while the server can sign the JWT with its private key.
 * This is a common practice in OAuth implementations to ensure secure communication between the client and server.
 * jack black
 * 
 * @returns {Object} An object containing the generated public and private keys.
 */
function generateKeyPair() {
    // Generate a new RSA key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048, // Key size in bits
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });

    // Write the keys to files
    fs.writeFileSync('publicKey.pem', publicKey);
    fs.writeFileSync('privateKey.pem', privateKey);

    return {
        publicKey,
        privateKey
    }
}

function getConfig() {
    let publicKey;
    let privateKey;

    // If publicKey.pem or privateKey.pem doesn't exist, create them
    if (!fs.existsSync('publicKey.pem') || !fs.existsSync('privateKey.pem')) {
        const keyPair = generateKeyPair();
        publicKey = keyPair.publicKey;
        privateKey = keyPair.privateKey;
    } else {
        publicKey = fs.readFileSync('publicKey.pem', 'utf8');
        privateKey = fs.readFileSync('privateKey.pem', 'utf8');
    }

    // If logNumber.json doesn't exist, create it
    if (!fs.existsSync('logNumbers.json')) {
        fs.copyFileSync('logNumbers-template.json', 'logNumbers.json');
    }

    // If there is no .env file, create one from the template
    if (!fs.existsSync('.env')) fs.copyFileSync('.env-template', '.env');
    
    dbGet("SELECT * FROM digipog_pools WHERE id = 0").then(formbarDevPool => {
        if (!formbarDevPool) {
            dbRun("INSERT INTO digipog_pools (id, name, description, amount) VALUES (?, ?, ?, ?)", [0, "Formbar Developer Pool", "Formbar Developer pog pool. Accumulates from the 10% tax on digipog transactions.", 0]);
            dbRun("INSERT INTO digipog_pool_users (id, owner) VALUES (?, ?)", [1, "0"]);
        }
    });

    return {
        logNumbers: JSON.parse(fs.readFileSync('logNumbers.json', "utf8")),
        settings: {
            'port': +process.env.PORT || 420,
            'whitelistActive': process.env.WHITELIST_ENABLED === 'true',
            'blacklistActive': process.env.BLACKLIST_ENABLED === 'true',
            'emailEnabled': process.env.EMAIL_ENABLED === 'true',
            'googleOauthEnabled': process.env.GOOGLE_OAUTH_ENABLED === 'true',
        },
        publicKey: publicKey,
        privateKey: privateKey
    }
}

module.exports = getConfig();