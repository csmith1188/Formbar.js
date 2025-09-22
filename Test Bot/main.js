
const URL = 'http://localhost:420';
const classID = 's1gx';

// Helper to parse Set-Cookie header
function getCookie(res) {
    const raw = res.headers.get('set-cookie');
    if (!raw) return '';
    // Only grab the session cookie
    const match = raw.match(/connect\.sid=[^;]+/);
    return match ? match[0] : '';
}

async function loginAndJoinClass() {
    // Step 1: Login as guest
    const loginRes = await fetch(`${URL}/login`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `displayName=BobGuest&loginType=guest`
    });
    const cookie = getCookie(loginRes);
    const loginText = await loginRes.text();
    console.log('Login response:', loginText);

    if (!cookie) {
        console.log('No session cookie received. Cannot join class.');
        return;
    }

    // Step 2: Join the class (assuming /joinClass endpoint exists)
    // If you have a specific endpoint for joining, use it. Otherwise, this is a placeholder.
    const joinRes = await fetch(`${URL}/joinClass`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie
        },
        body: `classID=${classID}`
    });
    const joinText = await joinRes.text();
    console.log('Join class response:', joinText);
}

loginAndJoinClass().catch(err => console.log('Error:', err));