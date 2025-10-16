const { isAuthenticated, permCheck, isVerified } = require("./middleware/authentication");
const { logNumbers } = require("../modules/config")
const { logger } = require("../modules/logger")

module.exports = {
    run(app) {
        app.get('/links', isAuthenticated, permCheck, isVerified, (req, res) => {
            try {
                logger.log('info', `[get /links] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`)

                res.render('pages/links.ejs', {
                    title: 'Links'
                })
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                })
            }
        })

        app.get('/links/getLinkFavicon', async (req, res) => {
            const imageUrl = req.query.url;
            if(!imageUrl.includes('https://www.google.com/s2/favicons?domain=')) return res.status(500).send('Error fetching image');

            try {
                const response = await fetch(imageUrl);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    res.set('Content-Type', response.headers.get('content-type'));
                    res.set('Access-Control-Allow-Origin', '*');
                    res.send(buffer);
                } else {
                    res.status(response.status).send('Error fetching image');
                }
            } catch (error) {
                console.error('Error fetching image:', error);
                res.status(500).send('Error fetching image');
            }
        });
    }
}