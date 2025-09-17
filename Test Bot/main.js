const axios = require('axios');
const qs = require('qs');
const tough = require('tough-cookie');

(async () => {
    const { wrapAxios } = await import('axios-cookiejar-support');
    wrapAxios(axios);

    const cookieJar = new tough.CookieJar();

    var users = [];

    axios.post(
        'http://localhost:420/login',
        qs.stringify({
            displayName: 'Bill',
            loginType: 'guest'
        }),
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            jar: cookieJar,
            withCredentials: true
        }
    )
    .then(response => {
        // Optionally, make a follow-up request to get user/session info
        return axios.get('http://localhost:420/profile', {
            jar: cookieJar,
            withCredentials: true
        });
    })
    .then(profileResponse => {
        users.push(profileResponse.data); // Save user/session data
        console.log('User session:', profileResponse.data);
    })
    .catch(error => {
        if (error.code === 'ECONNABORTED') {
            console.error('Login error: Request timed out');
        } else {
            console.error('Login error:', error.message);
        }
    });
})();