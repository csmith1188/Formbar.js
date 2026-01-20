const fs = require("fs").promises;
const logDir = "logs/";

async function getAllLogs() {
    try {
        const files = await fs.readdir(logDir);
        const logs = await Promise.all(
            files
                .filter((fileName) => fileName.endsWith(".log"))
                .map(async (fileName) => {
                    try {
                        const stat = await fs.stat(`${logDir}${fileName}`);
                        return stat.size > 0 ? fileName : null; // Exclude empty log files
                    } catch (e) {
                        return null;
                    }
                })
        );
        return logs.filter(Boolean); // Remove null values
    } catch (err) {
        throw new Error(`Failed to retrieve logs: ${err.message}`);
    }
}

async function getLog(logFileName) {
    try {
        const content = await fs.readFile(`${logDir}${logFileName}`, "utf8");
        return content;
    } catch (err) {
        throw new Error(`Failed to read log file ${logFileName}: ${err.message}`);
    }
}

module.exports = {
    getAllLogs,
    getLog,
};
