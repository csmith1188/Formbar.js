const fs = require("fs")

// @TODO: Make it automatically copy the templates if they don't exist
function getConfig() {
    return {
        logNumbers: JSON.parse(fs.readFileSync("logNumbers.json")),
        settings: JSON.parse(fs.readFileSync("settings.json"))
    }
}

module.exports = getConfig()