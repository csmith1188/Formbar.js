const fs = require("fs")

function getConfig() {
    // If logNumber.json doesn't exist, create it
    if (!fs.existsSync("logNumbers.json")) {
        fs.copyFileSync("logNumbers-template.json", "logNumbers.json")
    }

    // If settings.json doesn't exist, create it
    if (!fs.existsSync("settings.json")) {
        fs.copyFileSync("settings-template.json", "settings.json")
    }
    
    return {
        logNumbers: JSON.parse(fs.readFileSync("logNumbers.json")),
        settings: JSON.parse(fs.readFileSync("settings.json"))
    }
}

module.exports = getConfig()