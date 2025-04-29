const fs = require('fs');
const unzipper = require('unzipper');
const { logger } = require('./logger');
const { logNumbers } = require('./config');

let plugins = {};
function configPlugins(app) {
    const pluginDirs = fs.readdirSync('plugins');

    for (let i = 0; i < pluginDirs.length; i++) {
        let pluginDir = pluginDirs[i];
        const pluginPath = `plugins/${pluginDir}`;

        // Check if the file is a zip file
        if (pluginDir.endsWith('.zip')) {
            // Create a read stream for the zip file and pipe it to unzipper
            fs.createReadStream(pluginPath)
                .pipe(unzipper.Extract({ path: 'plugins' }))
                .on('error', (err) => logger.error(`Error extracting ${pluginDir}: ${err}`))
                .on('close', () => logger.log(`Extracted: ${pluginDir}`));
        }

        // Check if the plugin directory exists and contains app.js
        if (fs.lstatSync(pluginPath).isDirectory() && fs.existsSync(`${pluginPath}/app.js`)) {
            try {
                // Dynamically import the plugin module
                const plugin = require(`../${pluginPath}/app.js`);
                // Attempt to initialize the plugin
                if (typeof plugin.init === 'function') {
                    plugin.init(app);
                    logger.log('info', `Initialized plugin: ${plugin.name}`);
                    plugins[plugin.name] = plugin;
                } else {
                    logger.warning(`No init function found in plugin: ${plugin.name}`);
                }
            } catch (err) {
                logger.error(`Error initializing ${pluginDir}: ${err}`);
            }
        } else {
            logger.warning(`Plugin ${pluginDir} is not a valid directory or does not contain app.js`);
        }
    }

    logger.log('info', `Loaded ${Object.keys(plugins).length} plugin(s).`);
    return plugins;
}

module.exports = {
    configPlugins,
    plugins,
}