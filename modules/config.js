const fs = require('fs');

function getConfig() {
    // If logNumber.json doesn't exist, create it
    if (!fs.existsSync('logNumbers.json')) {
        fs.copyFileSync('logNumbers-template.json', 'logNumbers.json');
    };
    require('dotenv').config();
    if (!fs.existsSync('.env')) {
        fs.copyFileSync('.env-template', '.env');
    };
    settings = {
        'port': +process.env.PORT,
        'whitelistActive': process.env.WHITELIST_ENABLED === 'true',
        'blacklistActive': process.env.BLACKLIST_ENABLED === 'true',
        'emailEnabled': process.env.EMAIL_ENABLED === 'true',
        'googleOauthEnabled': process.env.GOOGLE_OAUTH_ENABLED === 'true',
    };
    
    return {
        logNumbers: JSON.parse(fs.readFileSync('logNumbers.json')),
        settings: settings
    };
};

module.exports = getConfig();