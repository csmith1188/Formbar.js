module.exports = {
    run(app) {
        // Party Time.
        app.get('/party', (req, res) => {
            try {
                logger.log('info', `[get /party] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)
                res.render('pages/party', {
                    title: 'Party',
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            };
        });
    }
};