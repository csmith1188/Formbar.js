const fs = require('fs');
const unzipper = require('unzipper');
const { logger } = require('./logger');
const { logNumbers } = require('./config');
const { database, dbGet, dbRun } = require('./database');
const { classInformation } = require('./class');

async function isEnabled(req, res, next) {
    if (!req.session.classId || req.session.classId === null) {
        return res.render('pages/message', {
            message: 'You are not in a class',
            title: 'Error'
        });
    }

    const pluginName = req.url.split('/')[1].replace(/\s+/g, '');
    const classPlugins = classInformation.classrooms[req.session.classId].plugins;
    const pluginId = await dbGet('SELECT id FROM plugins WHERE name=?', [pluginName]);
    const plugin = classPlugins[pluginId];
    if (!plugin || !pluginId) {
        res.render('pages/message', {
            message: `Plugin ${pluginName} does not exist`,
            title: 'Error'
        });
    }
    if (plugin.enabled == true && classInformation.classrooms[req.session.classId].isActive) {
        return next();
    } else {
        res.render('pages/message', {
            message: `Plugin ${pluginName} is not enabled`,
            title: 'Error'
        });
    }
}

let plugins = {};
async function configPlugins(app) {
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
                    const pluginName = plugin.name.replace(/\s+/g, '');
                    plugin.authors = plugin.authors.join(',');
                    const pluginData = await dbGet('SELECT * FROM plugins WHERE name=?', [pluginName]);
                    if (!pluginData) {
                        dbRun('INSERT INTO plugins (name, authors, description, version) VALUES (?, ?, ?, ?)', [pluginName, plugin.authors, plugin.description, plugin.version])
                            .then(() => {
                                logger.log('info', `Plugin ${plugin.name} added to database.`);
                            })
                            .catch((err) => {
                                logger.error(`Error adding plugin to database: ${err}`);
                            });
                    } else if (pluginData.version != plugin.version) {
                        database.run('UPDATE plugins SET (name, authors, description, version) = (?, ?, ?, ?) WHERE id = ?', [pluginName, plugin.authors, plugin.description, plugin.version, pluginData.id], (err) => {
                            if (err) {
                                logger.error(`Error updating plugin data: ${err}`);
                            } else {
                                logger.log('info', `Plugin ${plugin.name} updated in database.`);
                            }
                        });
                    }
                    dbGet('SELECT id FROM plugins WHERE name=?', [pluginName])
                        .then((row) => {
                            plugins[row.id] = plugin;
                        });
                } else {
                    logger.warning(`No init function found in plugin: ${plugin.name || pluginDir}`);
                }
            } catch (err) {
                logger.error(`Error initializing ${pluginDir}: ${err}`);
            }
        } else if (!pluginDir.endsWith('.zip')) {
            logger.warning(`Plugin ${pluginDir} is not a valid directory or does not contain app.js`);
        } else {
            logger.warning(`Plugin ${pluginDir.slice(0, -4)} was not extracted`);
        }
    }

    logger.log('info', `Loaded ${Object.keys(plugins).length} plugin(s).`);
    return plugins;
}

module.exports = {
    configPlugins,
    isEnabled,
    plugins,
}