# Formbar.js

Formbar.js is a comprehensive classroom polling and management system built with Node.js. The system provides tools for *form*ative assessment and a visual representation of class status through an interactive *bar* interface. Originally written in Python for Raspberry Pi, Formbar.js is a complete rewrite in JavaScript designed to be platform-agnostic.

## Features

### Core Functionality
- **Real-time Polling**: Create and manage interactive polls with multiple question types
- **Classroom Management**: Organize students into classes with customizable permissions
- **Student Tracking**: Monitor student participation, responses, and engagement
- **Break & Help System**: Students can request breaks or help with built-in approval workflow
- **Timer System**: Server-side timers with sound notifications
- **Tag System**: Organize and filter students with custom tags

### Digipog Economy
- **Digital Currency**: Earn digipogs through poll participation
- **Pog Meter**: Visual progress tracking for earning rewards
- **Transfer System**: Send digipogs between users with PIN security
- **Pool Management**: Create shared pools for group activities
- **Transaction Logging**: Complete audit trail of all transfers

### Advanced Features
- **Custom Polls**: Save and reuse poll templates
- **Poll Sharing**: Share polls between users and classes
- **Permission System**: Granular control over user capabilities
- **API Integration**: RESTful API and WebSocket support for third-party apps
- **Google OAuth**: Optional Google account integration
- **Email System**: Password reset and account verification
- **IP Management**: Whitelist/blacklist system for access control

### Technical Features
- **WebSocket API**: Real-time bidirectional communication
- **REST API**: HTTP endpoints for external integrations
- **Database**: SQLite for data persistence
- **Authentication**: Session-based and API key authentication
- **Logging**: Comprehensive Winston-based logging system
- **Testing**: Jest test suite included

## Quick Start

### Prerequisites
- Node.js 14+ 
- npm or yarn

### Installation
```bash
git clone https://github.com/csmith1188/Formbar.js.git
cd Formbar.js
npm install
```

### Database Setup
```bash
npm run init-db
npm run migrate
```

### Running the Application
```bash
# Development
npm run dev

# Production
npm start
```

### Configuration
1. Copy `.env-template` to `.env`
2. Configure your settings (port, email, OAuth, etc.)
3. The application will generate JWT keys automatically on first run

## API Documentation

- **WebSocket API**: See `websocket_docs.md` for complete socket event documentation
- **Digipog System**: See `digipog_docs.md` for currency and transfer documentation
- **REST API**: Available at `/api/*` endpoints

## Development

### Scripts
- `npm run dev` - Start with nodemon for development
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run format` - Format code with Prettier
- `npm run init-db` - Initialize database
- `npm run migrate` - Run database migrations

### Project Structure
```
├── app.js                 # Main application entry point
├── modules/               # Core application modules
├── routes/                # HTTP route handlers
├── sockets/               # WebSocket event handlers
├── views/                 # EJS templates
├── static/                # Static assets (CSS, JS, images)
├── database/              # Database initialization and migrations
└── tests/                 # Test files
```

## License

This project is licensed under the YCSTEL-1.0 License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- GitHub Issues: https://github.com/csmith1188/Formbar.js/issues
