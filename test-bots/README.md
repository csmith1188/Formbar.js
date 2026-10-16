# Setup

1. `cd test-bots`
2. Specify the formbar url at the top of the file where it says `export const FORMBAR_URL = 'http://localhost:420';`
3. node app
4. Type commands into the console

# Commands
- `make {amount}`: creates `{amount}`* bots, they all either make an account, or log in if they have one already
- `enroll {amount} {code}`: Takes bots 1 - `{amount}`* and enrolls them in a class using code {code}
- `leave {amount}`: Takes bot 1 - `{amount}`* and makes them leave their current class
- `getClass {amount}`: Takes bot 1 - `{amount}`* and makes them get their current class info
- `vote {amount} {response}`: Takes bot 1 - `{amount}`* and makes them vote for `{response}`
    - Set `{response}` to "`RANDOM`" for the bots to vote a random answer
- `cls`: Clears the terminal
- `clear`: Clears the terminal
- `exit`: Exits

*`{amount}` can be set to "`all`", specifying all bots