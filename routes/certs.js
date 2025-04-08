const fs = require('fs');

module.exports = {
    run(app) {
        app.get('/certs', (req, res) => {
            res.render('pages/message', {
                title: 'Certs',
                message: fs.readFileSync('publicKey.pem', 'utf8'),
                excluded: true
            })
        });
    }
}