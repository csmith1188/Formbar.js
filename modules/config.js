const fs = require('fs');
const crypto = require('crypto');

function getConfig() {
    // If publicKey.pem or privateKey.pem doesn't exist, create them
    if (!fs.existsSync('publicKey.pem') || !fs.existsSync('privateKey.pem')) {
        /*
            Private and public keys are to be used to make Formbar OAuth more secure.
            The public key is used to decrypt the data, and the private key is used to encrypt it.
            The public key is shared with the client, and the private key is kept secret on the server.
            This way, users' applications can verify the identity of the server and decrypt data that only the server can encrypt.
            This is a common practice in OAuth implementations to ensure secure communication between the client and server.
            jack black
        */
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
        fs.writeFileSync('publicKey.pem', publicKey);
        fs.writeFileSync('privateKey.pem', privateKey);
    } else {
        publicKey = fs.readFileSync('publicKey.pem', 'utf8');
        privateKey = fs.readFileSync('privateKey.pem', 'utf8');
    }
    // If logNumber.json doesn't exist, create it
    if (!fs.existsSync('logNumbers.json')) {
        fs.copyFileSync('logNumbers-template.json', 'logNumbers.json');
    };
    require('dotenv').config();
    if (!fs.existsSync('.env')) {
        fs.copyFileSync('.env-template', '.env');
    };
    settings = {
        'port': +process.env.PORT || 420,
        'whitelistActive': process.env.WHITELIST_ENABLED === 'true',
        'blacklistActive': process.env.BLACKLIST_ENABLED === 'true',
        'emailEnabled': process.env.EMAIL_ENABLED === 'true',
        'googleOauthEnabled': process.env.GOOGLE_OAUTH_ENABLED === 'true',
    };
    
    return {
        logNumbers: JSON.parse(fs.readFileSync('logNumbers.json')),
        settings: settings,
        publicKey: publicKey,
        privateKey: privateKey
    };
};

module.exports = getConfig();