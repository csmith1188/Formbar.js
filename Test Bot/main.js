const axios = require('axios').default
const tough = require('tough-cookie')

const URL = 'http://localhost:420'
const classID = '93nt'
const guestCount = 30
const actionMode = 'random'

// Store all user sessions
const userSessions = []

// Add better error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason)
    // Don't exit the process, just log it
})

async function createFakeGuest(displayName) {
    const { wrapper } = await import('axios-cookiejar-support') // dynamic import
    const jar = new tough.CookieJar()
    const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        timeout: 5000, // Reduced timeout to 5 seconds
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    }))

    try {
        // Add delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000))

        // Login as guest
        const loginResponse = await client.post(
            `${URL}/login`,
            new URLSearchParams({ displayName, loginType: 'guest' }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )

        if (loginResponse.status !== 200) {
            console.log(`⚠ ${displayName} login returned status ${loginResponse.status}`)
            return null
        }

        console.log(`✓ ${displayName} logged in (status ${loginResponse.status})`)

        // Add small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100))

        // Join the class
        const classResponse = await client.post(
            `${URL}/selectClass`,
            new URLSearchParams({ key: classID }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )

        if (classResponse.status !== 200) {
            console.log(`⚠ ${displayName} class join returned status ${classResponse.status}`)
            return null
        }

        console.log(`  → ${displayName} joined class (status ${classResponse.status})`)

        // Keep track of this user's session
        const session = { name: displayName, client, jar }
        userSessions.push(session)
        return session

    } catch (error) {
        console.log(`✗ Error for ${displayName}:`, error.response?.status || error.code || error.message)
        if (error.response?.data) {
            console.log(`  Error data:`, error.response.data.substring(0, 200))
        }
        return null
    }
}

async function submitPollResponse(session, optionId) {
    try {
        // Skip the GET request for now since that works fine
        console.log(`  📊 ${session.name} attempting to vote for option ${optionId}`)

        // Try with a shorter timeout specifically for poll submission
        const pollClient = axios.create({
            timeout: 30000000,
            validateStatus: (status) => status < 500
        })

        // Copy cookies from the session
        const cookies = session.jar.getCookiesSync(URL)
        const cookieHeader = cookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ')

        const formData = new URLSearchParams()
        formData.append('poll', optionId)

        const response = await pollClient.post(
            `${URL}/student`,
            formData,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": `${URL}/student`,
                    "Cookie": cookieHeader
                }
            }
        )
        console.log(`  ✓ ${session.name} voted for option ${optionId} (status ${response.status})`)
        return true
    } catch (error) {
        // Enhanced error logging
        console.log(`  ✗ ${session.name} failed to vote:`)
        console.log(`    Error type: ${error.constructor.name}`)
        console.log(`    Error code: ${error.code}`)
        console.log(`    Response status: ${error.response?.status}`)
        console.log(`    Error message: ${error.message}`)

        if (error.response?.data) {
            console.log(`    Response data:`, error.response.data.substring(0, 200))
        }

        // Check if it's a timeout or connection error
        if (error.code === 'ECONNABORTED') {
            console.log(`    → Request timed out - server may be overloaded`)
        } else if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log(`    → Connection issue detected`)
        }

        return false
    }
}

// Enhanced debug function to inspect the student page
async function debugStudentPage(session) {
    try {
        const response = await session.client.get(`${URL}/student`)
        console.log(`\n=== DEBUG: Student page for ${session.name} ===`)
        console.log(`Status: ${response.status}`)
        console.log(`Headers:`, Object.keys(response.headers))
        console.log(`Content-Type:`, response.headers['content-type'])
        console.log(`Content length:`, response.data?.length || 'unknown')
        console.log(`Content preview:`, response.data.substring(0, 800)) // Show more content

        // Look for poll-related content
        const pollMatches = response.data.match(/name=['"]poll['"][^>]*>/g)
        if (pollMatches) {
            console.log(`Found poll elements:`, pollMatches)
        } else {
            console.log(`No poll elements found with name="poll"`)
        }

        // Look for any input elements
        const inputMatches = response.data.match(/<input[^>]*>/g)
        if (inputMatches) {
            console.log(`Found input elements:`, inputMatches.slice(0, 10)) // Show first 10
        }

        // Look for form elements with action
        const formMatches = response.data.match(/<form[^>]*>/g)
        if (formMatches) {
            console.log(`Found forms:`, formMatches)
        }

        // Look for any button elements
        const buttonMatches = response.data.match(/<button[^>]*>[^<]*<\/button>/g)
        if (buttonMatches) {
            console.log(`Found buttons:`, buttonMatches)
        }

        // Check cookies
        const cookies = session.jar.getCookiesSync(URL)
        console.log(`Session cookies: ${cookies.length} cookies`)
        cookies.forEach(cookie => {
            console.log(`  ${cookie.key}=${cookie.value.substring(0, 20)}${cookie.value.length > 20 ? '...' : ''}`)
        })

        console.log(`=== END DEBUG ===\n`)

    } catch (error) {
        console.log(`Debug failed for ${session.name}:`)
        console.log(`  Error type: ${error.constructor.name}`)
        console.log(`  Error code: ${error.code}`)
        console.log(`  Error message: ${error.message}`)
        if (error.response) {
            console.log(`  Response status: ${error.response.status}`)
            console.log(`  Response data preview:`, error.response.data?.substring(0, 200))
        }
    }
}

// Add a function to test basic connectivity
async function testConnectivity() {
    console.log('\n=== TESTING BASIC CONNECTIVITY ===')
    try {
        const response = await axios.get(URL, { timeout: 3000 })
        console.log(`✓ Server is reachable. Status: ${response.status}`)
        console.log(`✓ Content-Type: ${response.headers['content-type']}`)

        // Test the student page specifically
        const studentResponse = await axios.get(`${URL}/student`, { timeout: 3000 })
        console.log(`✓ Student page accessible. Status: ${studentResponse.status}`)

        return true
    } catch (error) {
        console.log(`✗ Server connectivity test failed:`)
        console.log(`  Error code: ${error.code}`)
        console.log(`  Error message: ${error.message}`)
        if (error.response) {
            console.log(`  Response status: ${error.response.status}`)
        }
        return false
    }
}

async function simulatePollInteractions() {
    if (userSessions.length === 0) {
        console.log('No active user sessions available for poll interactions')
        return
    }

    console.log('\nStarting poll interaction simulation...')
    console.log('Commands:')
    console.log('  vote <option> - All users vote for specific option (e.g., "vote A")')
    console.log('  random <option1,option2,option3> - Users vote randomly from given options (e.g., "random A,B,C,D")')
    console.log('  single <option> - Single user votes for testing')
    console.log('  debug - Show debug info for first user session')
    console.log('  test - Test basic server connectivity')
    console.log('  stop - Stop the simulation')
    console.log('  exit - Exit the program\n')

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', async (input) => {
        const command = input.trim()

        if (command === 'exit') {
            process.exit(0)
        } else if (command === 'stop') {
            console.log('Poll simulation stopped. Waiting for new commands...')
        } else if (command === 'test') {
            await testConnectivity()
        } else if (command === 'debug') {
            if (userSessions.length > 0) {
                await debugStudentPage(userSessions[0])
            }
        } else if (command.startsWith('single ')) {
            const option = command.substring(7).trim()
            if (userSessions.length > 0) {
                console.log(`Testing single vote with ${userSessions[0].name} for option: ${option}`)
                const result = await submitPollResponse(userSessions[0], option)
                console.log(`Single vote test: ${result ? 'SUCCESS' : 'FAILED'}`)
            }
        } else if (command.startsWith('vote ')) {
            const option = command.substring(5).trim()
            console.log(`Making all users vote for option: ${option}`)

            // Increased delay between each user's vote to reduce server load
            const results = []
            for (let i = 0; i < userSessions.length; i++) {
                const session = userSessions[i]
                const result = await submitPollResponse(session, option)
                results.push(result)

                // Longer delay between votes to prevent timeouts
                if (i < userSessions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500)) // Increased to 500ms
                }
            }

            const successful = results.filter(r => r).length
            console.log(`Vote completed: ${successful}/${userSessions.length} users voted successfully`)

        } else if (command.startsWith('random ')) {
            const optionsStr = command.substring(7).trim()
            const options = optionsStr.split(',').map(opt => opt.trim())

            if (options.length === 0) {
                console.log('Please provide options separated by commas (e.g., "random A,B,C,D")')
                return
            }

            console.log(`Making users vote randomly from options: ${options.join(', ')}`)

            // Sequential voting with longer delays
            const results = []
            for (let i = 0; i < userSessions.length; i++) {
                const session = userSessions[i]
                const randomOption = options[Math.floor(Math.random() * options.length)]
                const result = await submitPollResponse(session, randomOption)
                results.push(result)

                // Longer delay between votes
                if (i < userSessions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500)) // Increased to 500ms
                }
            }

            const successful = results.filter(r => r).length
            console.log(`Random vote completed: ${successful}/${userSessions.length} users voted successfully`)

        } else if (command.trim() !== '') {
            console.log('Unknown command. Available commands: vote <option>, random <option1,option2,...>, single <option>, debug, test, stop, exit')
        }
    })
}

async function createThirtyGuests() {
    console.log('Creating fake guest users...')

    // Create guests in smaller batches to avoid overwhelming the server
    const batchSize = 5
    for (let batch = 0; batch < Math.ceil(guestCount / batchSize); batch++) {
        const batchPromises = []
        const start = batch * batchSize + 1
        const end = Math.min((batch + 1) * batchSize, guestCount)

        console.log(`Creating batch ${batch + 1}: guests ${start}-${end}`)

        for (let i = start; i <= end; i++) {
            const name = `guest${i}`
            batchPromises.push(createFakeGuest(name))
        }

        const batchResults = await Promise.allSettled(batchPromises)
        batchResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.log(`Failed to create guest${start + index}:`, result.reason)
            }
        })

        // Wait between batches
        if (batch < Math.ceil(guestCount / batchSize) - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }

    console.log(`\nFinished creating users. Total active sessions: ${userSessions.length}`)

    // Verify sessions are unique
    console.log('\nTesting sessions are unique:')
    userSessions.forEach((session, index) => {
        const cookies = session.jar.getCookiesSync(URL)
        console.log(`Session ${index + 1}: ${session.name}, Cookie count: ${cookies.length}`)
    })

    // Start poll interaction simulation
    await simulatePollInteractions()
}

createThirtyGuests().catch(err => console.error('Fatal error:', err))