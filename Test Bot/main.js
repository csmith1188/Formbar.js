
const URL = 'http://172.16.3.164:420';
const classID = 's1gx';

// Helper to parse Set-Cookie header
function getCookie(res) {
    console.log(res.headers);
    
    const raw = res.headers.get('set-cookie');
    console.log(raw);
    
    if (!raw) return '';
    // Only grab the session cookie
    const match = raw.match(/connect\.sid=[^;]+/);
    console.log(match);
    
    return match ? match[0] : '';
}

async function loginAndJoinClass() {
    // Step 1: Login as guest
    const loginRes = await fetch(`${URL}/login`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `displayName=${encodeURIComponent('BobGuest2')}&loginType=${encodeURIComponent('guest')}`,
        credentials: 'include',
        
    });
        // Debug: print status and headers
        console.log('Login response status:', loginRes.status);
        console.log('Login response headers:', loginRes.headers);
        // Print all headers for inspection
        for (const [key, value] of loginRes.headers.entries()) {
            console.log(`${key}: ${value}`);
        }
    const cookie = getCookie(loginRes);
    const loginText = await loginRes.text();
        // console.log('Login response body:', loginText);

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