const fs = require('fs');
require('dotenv').config();

function getConfig() {
    // If there is no logNumber.json file, create it from the template
    if (!fs.existsSync('logNumbers.json')) {
        fs.copyFileSync('logNumbers-template.json', 'logNumbers.json');
    }

    // If there is no .env file, create one from the template
    if (!fs.existsSync('.env')) {
        fs.copyFileSync('.env-template', '.env');
    }
    
    return {
        logNumbers: JSON.parse(fs.readFileSync('logNumbers.json', "utf8")),
        settings: {
            'port': +process.env.PORT || 420,
            'whitelistActive': process.env.WHITELIST_ENABLED === 'true',
            'blacklistActive': process.env.BLACKLIST_ENABLED === 'true',
            'emailEnabled': process.env.EMAIL_ENABLED === 'true',
            'googleOauthEnabled': process.env.GOOGLE_OAUTH_ENABLED === 'true',
        }
    }
}

module.exports = getConfig();