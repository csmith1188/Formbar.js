const fs = require('fs');
const unzipper = require('unzipper');
const { logger } = require('./logger');
const { logNumbers } = require('./config');

function configPlugins() {
    let plugins = {};
    for (let i = 0; i < fs.readdirSync('./plugins').length; i++) {
        let pluginDir = fs.readdirSync('./plugins')[i];
        // Check if the file is a directory and not a zip file
        if (fs.readdirSync(pluginDir).endsWith('.zip')) {
            // Create a read stream for the zip file and pipe it to unzipper
            fs.createReadStream(`./plugins/${pluginDir}`)
                .pipe(unzipper.Extract({ path: './plugins' }))
                .on('error', (err) => logger.error(`Error extracting ${pluginDir}: ${err}`))
                .on('close', () => logger.log(`Extracted: ${pluginDir}`));
        }
        const pluginPath = `./plugins/${pluginDir}`;
        // Check if the plugin directory exists and contains app.js
        if (fs.lstatSync(pluginPath).isDirectory() && fs.existsSync(pluginPath + '/app.js')) {
            try {
                let plugin = require(pluginPath + '/app.js').plugin;
                // Attempt to initialize the plugin
                if (typeof plugin.init === 'function') {
                    plugin.init();
                    logger.log(`Initialized plugin: ${plugin.name}`);
                    plugins[plugin.name] = plugin;
                } else {
                    logger.warning(`No init function found in plugin: ${plugin.name}`);
                }
            } catch (err) {
                logger.error(`Error initializing plugin ${plugin.name}: ${err}`);
            }
        } else {
            logger.warning(`Plugin ${pluginDir} is not a valid directory or does not contain app.js`);
            continue;
        }
    }
    return plugins;
}

module.exports = configPlugins();