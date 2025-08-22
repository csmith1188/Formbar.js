# Uses
## Add to your Program
### Overview
You will need to:
* Import 2 modules (JSONWebToken and express-session),
* Assign an Auth URL (Decided by main server in Formbar.js)
* Create a function that checks if the user is authenticated
* Make a Homepage that uses the authentication function
* Make a Login page that checks for a token for further user authentication

### Installing Packages
To install to node application                     
```
npm i jsonwebtoken
npm i express-session
```
To import to javascript file  
```
const jwt = require('jsonwebtoken');
const session = require('express-session');
```

### Authentication and Redirect URL
The authentication URL is wherever you'd like to redirect to for verification/authentication. In this case, for Formbar.js, the URL would be something like this: 'http://localhost:420/oauth'. This authentication system can be used when creating a plugin (which is the recommended
usage of this API), you'd want to set AUTH_URL to whatever your plugin is for in order for it to authenticate the user in both the plugin and
the server.
```JS
const AUTH_URL = 'http://localhost:420/oauth'; // ... or the address to the instance of fbjs you wish to connect to
```
When you send the user to the Formbar Login page, it needs to know where to send the user back to upon completion. This should be your login page.
```JS
const THIS_URL = 'http://localhost:3000/login'; // ... or whatever the address to your application is
```

### Session Middleware
This creates session middleware with given options. The 'secret' option is used to sign the session ID cookie. The 'resave' option is used to force the session to be saved back to the session store, even if the session was never modified during the request. The 'saveUninitialized' option is used to force a session that is not initialized to be saved to the store.
```JS
app.use(session({
  secret: 'make up a secret string here but never publish it!',
  resave: false,
  saveUninitialized: false
}))
```

It is a good idea to use a Environment Variable or a `.env` file that is in the `.gitignore` file for your `SECRET`. This will prevent it from getting out and allowing people to hack your cookies.

### Authentication Function
This authenticates the user and checks to see if the user is logged in. If so, it will continue the process like usual, if not, it will redirect the user to the login page. Example code:
```JS
function isAuthenticated(req, res, next) {
     if (req.session.user) next()
     else res.redirect('/login')
};
```

### Homepage
The homepage uses our function isAuthenticated to check for the user. When that succeeds, it tries to render your index/home page (depending on what you decide to name it) and carries over the 'req.session.user' data as the 'user' variable. Where this data comes from will be covered in '/login'.
Example code:
```JS
app.get('/', isAuthenticated, (req, res) => {
     try {
          res.render('index.ejs', {user : req.session.user})
     }
     catch (error) {
          res.send(error.message)
     }
});
```

NOTE: In newer versions, you will be able to use a refresh token in order to get updates on the user's Formbar data. This refresh token expires every 14 days compared to the access tokens, which expire every 30 minutes. This wiki page will be updated again once this is merged into the main branch, but an example is provided below.

The following isAuthenticated function checks when the access token expires and promptly retrieves a new one using the user's refresh token.
```JS
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        const tokenData = req.session.token;

        try {
            // Check if the token has expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (tokenData.exp < currentTime) {
                throw new Error('Token has expired');
            }

            next();
        } catch (err) {
            res.redirect(`${FBJS_URL}/oauth?refreshToken=${tokenData.refreshToken}&redirectURL=${THIS_URL}`);
        }
    } else {
        res.redirect(`/login?redirectURL=${THIS_URL}`);
    }
}
```

### Login Page
This is what happens when the user tries to login. First, it checks if there is the query parameter of 'token'. This is used to check if there is a token present, which is carried over from the server side as said query parameter. If there is a token parameter present, then it decodes the token and stores it into a temporary variable. This is because every time the user reconnects to the server, there will be a new token generated. It then saves the entirety of the token data into a cookie, with only the username data being stored in another. From there, it redirects back to your homepage. If there is not a token, it redirects you to the server authentication page, with the query parameter of 'redirectURL' being given the THIS_URL variable from earlier, which should be your login page (or your page of choice). Example code:
```JS
app.get('/login', (req, res) => {
     if (req.query.token) {
          let tokenData = jwt.decode(req.query.token);
          req.session.token = tokenData;
          req.session.user = tokenData.username;
          res.redirect('/');
     } else {
          res.redirect(`${AUTH_URL}?redirectURL=${THIS_URL}`);
     };
});
```
## Example nodeJS Application
```JS
const jwt = require('jsonwebtoken')
const express = require('express')
const app = express()
const session = require('express-session')

const FBJS_URL = 'http://localhost:420'
const THIS_URL = 'http://localhost:3000/login'
const API_KEY = 'dab43ffb0ad71caa01a8c758bddb8c1e9b9682f6a987b9c2a9040641c415cb92c62bb18a7769e8509cb823f1921463122ad9851c5ff313dc24d929892c86f86a'

app.use(session({
	secret: 'ohnose!',
	resave: false,
	saveUninitialized: false
}))

function isAuthenticated(req, res, next) {
	console.log("Checking Auth")
	if (req.session.user) next()
	else res.redirect(`/login?redirectURL=${THIS_URL}`)
}

app.get('/', isAuthenticated, (req, res) => {
	console.log("Root")
	try {
		fetch(`${FBJS_URL}/api/me`, {
			method: 'GET',
			headers: {
				'API': API_KEY,
				'Content-Type': 'application/json'
			}
		})
			.then(response => {
				return response.json();
			})
			.then(data => {
				res.send(data);
			})
	}
	catch (error) {
		res.send(error.message)
	}
})

app.get('/login', (req, res) => {
	console.log(req.query.token)
	if (req.query.token) {
		let tokenData = jwt.decode(req.query.token)
		req.session.token = tokenData
		req.session.user = tokenData.username
		res.redirect('/')
	} else {
		res.redirect(`${FBJS_URL}/oauth?redirectURL=${THIS_URL}`)
	}
})

app.listen(3000)
```