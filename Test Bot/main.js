const axios = require('axios').default;
const tough = require('tough-cookie');

const URL = 'http://localhost:420';
const classID = 's1gx';

// Store all user sessions
const userSessions = [];

async function createFakeGuest(displayName) {
    const { wrapper } = await import('axios-cookiejar-support'); // dynamic import
    const jar = new tough.CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));

    try {
        // Login as guest
        const loginResponse = await client.post(
            `${URL}/login`,
            new URLSearchParams({ displayName, loginType: 'guest' }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        console.log(`✓ ${displayName} logged in (status ${loginResponse.status})`);

        // Join the class
        const classResponse = await client.post(
            `${URL}/selectClass`,
            new URLSearchParams({ key: classID }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        console.log(`  → ${displayName} joined class (status ${classResponse.status})`);

        // Keep track of this user’s session
        userSessions.push({ name: displayName, client, jar });
        return { name: displayName, client, jar };

    } catch (error) {
        console.log(`✗ Error for ${displayName}:`, error.response?.status, error.response?.data);
        return null;
    }
}

async function createThirtyGuests() {
    console.log('Creating 30 fake guest users...');

    // Fire off all 30 at once
    const promises = [];
    for (let i = 1; i <= 30; i++) {
        const name = `guest${i}`;
        promises.push(createFakeGuest(name));
    }

    await Promise.all(promises);

    console.log(`\nFinished creating users. Total active sessions: ${userSessions.length}`);

    // Verify sessions are unique
    console.log('\nTesting sessions are unique:');
    userSessions.forEach((session, index) => {
        const cookies = session.jar.getCookiesSync(URL);
        console.log(`Session ${index + 1}: ${session.name}, Cookie count: ${cookies.length}`);
    });

    console.log('\nSessions are active. Press Ctrl+C to exit.');
    process.stdin.resume();
}

createThirtyGuests().catch(err => console.error('Fatal error:', err));
