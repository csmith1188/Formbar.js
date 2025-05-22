const { isVerified } = require('../modules/authentication');
const { logger } = require('../modules/logger');
const { logNumbers } = require('../modules/config');
const { database } = require('../modules/database');
const { classInformation } = require('../modules/class/classroom');

module.exports = {
    run(app) {
        app.get('/plugins', isVerified, async (req, res) => {
            try {
                database.all('SELECT * FROM plugins ORDER BY id ASC', (err, rows) => {
                    if (err) {
                        logger.log('error', err.stack);
                        return res.render('pages/message', {
                            message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                            title: 'Error'
                        });
                    }
                    res.render('pages/plugins', {
                        plugins: rows,
                        classPlugins: req.session.classId ? classInformation.classrooms[req.session.classId].plugins : {},
                        title: 'Plugins'
                    });
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            }
        });
    }
}