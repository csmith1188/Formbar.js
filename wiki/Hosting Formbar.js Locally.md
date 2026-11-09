# Formbar.js Developer Setup Guide

This comprehensive guide will help you set up Formbar for development, testing, and contribution. Formbar is now split into two repositories:

- **Formbar.js**: backend API, Socket.IO server, database, migrations, and Swagger docs.
- **Formbar.ts-client**: official frontend web app.

Follow these instructions to run both pieces on your local machine.

## Table of Contents
1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Basic Setup](#basic-setup)
4. [Advanced Configuration](#advanced-configuration)
5. [Development Workflow](#development-workflow)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Contributing](#contributing)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **[Node.js](https://nodejs.org/)** (Version 18.x or higher recommended for the backend; 20.19+ recommended for the frontend)
- **[npm](https://www.npmjs.com/get-npm)** (Usually comes with Node.js)
- **[Git](https://git-scm.com/)** (To clone the repository)

### Optional but Recommended
- **Code Editor**: VS Code, WebStorm, or your preferred editor
- **Database Browser**: SQLite Browser for database inspection
- **API Testing Tool**: Postman or Insomnia for API testing

### System Requirements
- **Operating System**: Windows, macOS, or Linux
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 1GB free space for dependencies and database
- **Network**: Internet connection for package installation

---


## Quick Start

For a quick backend development setup, access the terminal and copy the following code:

```bash
git clone https://github.com/csmith1188/Formbar.js.git
cd Formbar.js
npm install
cp .env-template .env
npm run init-db
npm run migrate
npm run dev
```

Then start the frontend:

```bash
git clone https://github.com/csmith1188/Formbar.ts-client.git
cd Formbar.ts-client
npm install
cp .env-template .env
npm run dev
```

Visit the frontend dev server, usually `http://localhost:5173`. The backend API remains available at `http://localhost:420`, with Swagger docs at `http://localhost:420/docs`.

---

## Basic Setup

### 1. Clone the Repository

Clone Formbar.js from GitHub:

```bash
git clone https://github.com/csmith1188/Formbar.js.git
cd Formbar.js
```

#### Branch Selection
Choose the appropriate branch for your development needs:

```bash
# Main branch (stable)
git checkout main

# Release Candidate (most recent stable)
git switch RC

# Development branch (experimental features)
git switch DEV
```
To test your branch again, be sure to use `node app` again.

### 2. Install Dependencies

Install all required Node.js packages:

```bash
npm install
```

This will install all dependencies listed in `package.json`, including:
- Express.js for web server
- Socket.io for real-time communication
- SQLite3 for database
- Winston for logging
- And many more...

### 3. Environment Configuration

Copy the environment template and configure your settings:

```bash
cp .env-template .env
```

Edit the `.env` file with your preferred editor:

```env
## Environmental variables for Formbar
PORT='420'
WHITELIST_ENABLED='false'
BLACKLIST_ENABLED='false'
FRONTEND_URL='http://localhost:5173' # No trailing slash

# Base percentage pog meter increments per response
POG_METER_INCREMENT=20

# Trust proxy determines how many jumps Express will accept in the proxy chain.
# For example, Nginx is one jump, and Cloudflare + Nginx is two jumps.
# Not doing this will cause rate limiting issues.
TRUST_PROXY=1
ENABLE_CORS='false' # Set this to true if you are not enforcing CORS through nginx or another reverse proxy. This is not recommended for production, but can be useful for development or testing without a reverse proxy.

# For the email API
EMAIL_ENABLED='false'
EMAIL_USER='SampleUser@SampleAddress.com'
EMAIL_PASSWORD='S@mpleP@ssw0rd!'

NODE_ENV=development
SEQ_URL='http://localhost:6767'

GOOGLE_OIDC_ISSUER='https://accounts.google.com'
GOOGLE_OIDC_CLIENT_ID=''
GOOGLE_OIDC_CLIENT_SECRET=''

MICROSOFT_OIDC_ISSUER='https://login.microsoftonline.com/common/v2.0'
MICROSOFT_OIDC_CLIENT_ID=''
MICROSOFT_OIDC_CLIENT_SECRET=''
MICROSOFT_OIDC_TENANT_ID=''

# Rate limiting controls

# RATE_LIMIT_MULTIPLIER - Scales all per-user request limits (guests, students, teachers).
#   Default: 1 (no change).
RATE_LIMIT_MULTIPLIER='1'

# RATE_LIMIT_BASE_POINTS - Base number of points applied before multiplier (default: 60)
#   Example: set to 120 to allow 120 requests per `RATE_LIMIT_DURATION_SECONDS` window
RATE_LIMIT_BASE_POINTS='60'

# RATE_LIMIT_DURATION_SECONDS - Window duration in seconds for the base points (default: 60)
#   Example: set to 60 for per-minute limits, or 900 for 15-minute windows
RATE_LIMIT_DURATION_SECONDS='60'

```

### 4. Database Initialization

Initialize the SQLite database with required tables:

```bash
npm run init-db
```

This creates:
- User tables
- Classroom tables
- Poll tables
- Digipog economy tables
- Transaction logs
- And more...

### 5. Run Database Migrations

Apply any pending database migrations:

```bash
npm run migrate
```

### 6. Start the Backend

#### Development Mode (Recommended)
```bash
npm run dev
```
This uses nodemon for automatic restart on file changes.

#### Production Mode
```bash
npm start
```

#### Manual Start
```bash
node app.js
```

### 7. Set Up the Frontend

Clone and install the official client:

```bash
git clone https://github.com/csmith1188/Formbar.ts-client.git
cd Formbar.ts-client
npm install
cp .env-template .env
```

Configure the frontend `.env`:

```env
VITE_FORMBAR_API_URL=http://localhost:420
VITE_FORMBAR_CLIENT_URL=http://localhost:5173
VITE_ENCRYPTION_KEY=replace-this-for-shared-dev-environments
```

Start the frontend:

```bash
npm run dev
```

### 8. Verify Installation

1. Open your browser and navigate to the frontend dev URL, usually `http://localhost:5173`
2. You should see the Formbar.js login page
3. Create a test account to verify functionality
4. Open `http://localhost:420/docs` to verify the backend Swagger docs
5. Check the backend and frontend consoles for any error messages

---

## Advanced Configuration

### Email System Setup

Enable email functionality for password resets and notifications:

#### 1. Gmail Setup (Recommended)
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"

#### 2. Update Environment Variables
In order to use email verification in Formbar, the following settings in the .env file need changed.
```env
EMAIL_ENABLED=true
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

#### 3. Alternative Email Providers
Configure SMTP settings for other providers:
```env
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### OIDC Login Setup

Formbar supports OpenID Connect login providers. The default documented providers are Google and Microsoft; configure only the providers you want to enable.

### Google OIDC Setup

Enable Google account login:

#### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g., "FormbarOAuth")
3. Enable billing if required

#### 2. Enable APIs
1. Navigate to "APIs & Services" → "Library"
2. Search for "Google People API"
3. Click "Enable"

#### 3. Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Click "Get Started"
3. Fill out required information:
   - App name: "Formbar.js"
   - User support email: Your email
   - Developer contact: Your email
4. Save and continue

#### 4. Create OAuth Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Web Application"
4. Configure URIs:
   - **Authorized JavaScript Origins**: `http://localhost:420`
   - **Authorized redirect URIs**: `http://localhost:420/api/v1/auth/oidc/google/callback`

#### 5. Update Environment Variables
In order to use Google login, the following settings need changed in the `.env` file.
```env
GOOGLE_OIDC_ISSUER=https://accounts.google.com
GOOGLE_OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OIDC_CLIENT_SECRET=your-client-secret
```

### Microsoft OIDC Setup

To enable Microsoft login, register an application in Microsoft Entra ID and set:

```env
MICROSOFT_OIDC_ISSUER=https://login.microsoftonline.com/common/v2.0
MICROSOFT_OIDC_CLIENT_ID=your-client-id
MICROSOFT_OIDC_CLIENT_SECRET=your-client-secret
MICROSOFT_OIDC_TENANT_ID=
```

Use your tenant ID if you want to restrict sign-in to one tenant.

### IP Management Setup

Configure IP whitelist/blacklist for access control:

```env
WHITELIST_ENABLED=true
BLACKLIST_ENABLED=true
```

Use the Manager panel to manage IP lists after setup.

---

## Development Workflow

### Project Structure

Backend:

```
Formbar.js/
├── app.js                 # Main application entry point
├── api/v1/controllers/    # Versioned HTTP route handlers with Swagger comments
├── services/              # Business/domain services
├── modules/               # Core application modules
├── middleware/            # Express middleware
├── sockets/               # Socket.IO event handlers
│   ├── middleware/        # Socket middleware
│   └── polls/             # Poll-related sockets
├── stores/                # In-memory runtime/cache stores
├── docs/                  # OpenAPI component schemas
├── database/              # Database initialization and migrations
└── */tests/               # Jest test files near each module area
```

Frontend:

```
Formbar.ts-client/
├── src/api/               # Frontend API wrappers for /api/v1
├── src/pages/             # React route pages
├── src/components/        # Shared React components
├── src/utils/socket.ts    # Socket.IO client connection/auth
├── public/                # Static assets
├── vite.config.ts         # Vite config
└── package.json           # Frontend scripts and dependencies
```

### Development Scripts

Backend:

```bash
# Development with auto-restart
npm run dev

# Production mode
npm start

# Run tests
npm test

# Format code
npm run format

# Check code formatting
npm run format:check

# Initialize database
npm run init-db

# Run migrations
npm run migrate
```

Frontend:

```bash
# Development with Vite
npm run dev

# Build frontend
npm run build

# Preview built frontend
npm run preview

# Lint frontend
npm run lint
```

### Code Organization

#### Adding New Features
1. **HTTP Controllers**: Add versioned endpoints in `api/v1/controllers/`
2. **Sockets**: Add WebSocket events in `sockets/`
3. **Services**: Add business logic in `services/`
4. **Modules**: Add shared low-level helpers in `modules/`
5. **Stores**: Add runtime/cache state in `stores/` when persistent DB storage is not appropriate

#### Database Changes
1. Create migration files in `database/migrations/`
2. Update schema in `database/init.sql`
3. Test migrations with `npm run migrate`

#### Testing New Features
1. Write tests in appropriate `tests/` directories
2. Run tests with `npm test`
3. Ensure all tests pass before committing

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "Add your feature description"

# Push to remote
git push origin feature/your-feature-name

# Create pull request on GitHub
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testNamePattern="specific test"

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Test Structure

```
tests/
├── api/v1/controllers/tests/ # HTTP controller tests
├── modules/tests/            # Module tests
├── services/tests/           # Service tests
├── middleware/tests/         # Middleware tests
├── sockets/tests/            # Socket tests
```

### Writing Tests

#### Example Test Structure
```javascript
describe('Poll Creation', () => {
    test('should create poll with valid data', async () => {
        const pollData = {
            prompt: 'Test question',
            answers: ['Option A', 'Option B']
        };
        
        const result = await createPoll(classId, pollData, userSession);
        expect(result).toBeDefined();
    });
});
```

#### Testing Guidelines
1. **Unit Tests**: Test individual functions and modules
2. **Integration Tests**: Test API endpoints and database operations
3. **Socket Tests**: Test WebSocket event handling
4. **Coverage**: Aim for high test coverage on critical paths

---

## Debugging

This section is mainly for advanced users, but it does contain some common issues. If you're not working on Formbar or having issues, you may ignore this section.

### Logging System

Formbar.js uses Winston for comprehensive logging:

```javascript
const { logger } = require('./modules/logger');

// Log levels: error, warn, info, verbose, debug
logger.log('info', 'User logged in', { userId: 123 });
logger.log('error', 'Database connection failed', { error: err.message });
```

### Debug Configuration

### Common Debug Scenarios

#### 1. Database Issues
When switching to other branches, you may need to run `npm run migrate` to update the database. We do not support switching from a newer branch to an older branch, so issues may arise in that scenario.
```bash
# Check database file exists
ls -la database/database.db

# Reinitialize database
rm database/database.db
npm run init-db
npm run migrate
```

#### 2. Permission Issues
- Check user permissions in database
- Verify session data
- Review permission middleware

#### 3. Socket Connection Issues
- Check WebSocket connection in browser dev tools
- Verify Socket.io configuration
- Check for CORS issues

#### 4. Poll Issues
- Verify poll data structure
- Check student permissions
- Review poll creation logic

---

## Contributing

### Code Standards

#### JavaScript Style
- Use ES6+ features
- Follow async/await patterns
- Use meaningful variable names
- Add JSDoc comments for functions

#### Code Formatting
```bash
# Format code before committing
npm run format

# Check formatting
npm run format:check
```

#### Database Standards
- Use prepared statements
- Handle errors gracefully
- Use transactions for multi-step operations
- Follow naming conventions

### Pull Request Process

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes** following code standards
4. **Add tests** for new functionality
5. **Run tests**: `npm test`
6. **Format code**: `npm run format`
7. **Commit changes**: `git commit -m "Add amazing feature"`
8. **Push to branch**: `git push origin feature/amazing-feature`
9. **Create Pull Request**

### Commit Message Format

```
type(scope): description

Examples:
feat(polls): add custom poll templates
fix(auth): resolve session timeout issue
docs(api): update WebSocket documentation
test(users): add user creation tests
```

### Code Review Checklist

- [ ] Code follows project standards
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No console.log statements in production code
- [ ] Error handling is appropriate
- [ ] Security considerations addressed

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port 420
lsof -i :420

# Kill process
kill -9 <PID>

# Or use different port
PORT=421 npm start
```

#### 2. Database Locked
```bash
# Check for running processes
ps aux | grep node

# Kill all Node processes
pkill -f node

# Restart application
npm start
```

#### 3. Module Not Found
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 4. Permission Denied
```bash
# Fix file permissions
chmod +x app.js

# Or run with sudo (not recommended)
sudo npm start
```

#### 5. Environment Variables Not Loading
- Ensure `.env` file exists in project root
- Check for typos in variable names
- Restart application after changes
- Verify file permissions

### Performance Issues

#### 1. Slow Database Queries
- Add database indexes
- Use prepared statements
- Optimize query structure
- Consider connection pooling

#### 2. Memory Leaks
- Monitor memory usage
- Check for event listener leaks
- Review socket connection handling
- Use Node.js profiling tools

#### 3. High CPU Usage
- Profile application with `--inspect`
- Check for infinite loops
- Optimize database queries
- Review WebSocket event handling

### Getting Help

1. **Check Issues**: Search existing GitHub issues
2. **Create Issue**: Provide detailed error information
3. **Community**: Join discussions in GitHub Discussions
4. **Documentation**: Review all documentation files
5. **Logs**: Check application logs for error details

### Useful Commands

```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# View application logs
tail -f logs/application-*.log

# Check database integrity
sqlite3 database/database.db "PRAGMA integrity_check;"

# Monitor system resources
htop
# or
top
```

---

## Additional Resources

- **Main Documentation**: See the [Home Page](https://github.com/csmith1188/Formbar.js/wiki) for user guide
- **Swagger Docs**: Visit `/docs` on a running server for generated REST API documentation
- **API Documentation**: See the [HTTP Docs](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API) for REST API examples
- **WebSocket Documentation**: See the [WebSocket Docs](https://github.com/csmith1188/Formbar.js/wiki/WebSocket-API) for real-time API
- **Digipog Documentation**: See the [Digipog Docs](https://github.com/csmith1188/Formbar.js/wiki/Digipogs) for currency system
- **GitHub Repository**: https://github.com/csmith1188/Formbar.js
- **Issues**: https://github.com/csmith1188/Formbar.js/issues

---

*Happy coding! If you encounter any issues not covered in this guide, please create an issue on GitHub with detailed information about your setup and the problem you're experiencing.*
