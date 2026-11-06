# Formbar.js - Complete User Guide

Formbar.js is a comprehensive classroom management and polling system that provides real-time interaction between teachers and students. The system features a digital currency economy (Digipogs), advanced polling capabilities, timer systems, and extensive classroom management tools.

## Table of Contents
1. [Getting Started](#getting-started)
2. [Account Management](#account-management)
3. [Class Setup](#class-setup)
4. [Core Features](#core-features)
5. [Teacher Controls](#teacher-controls)
6. [Student Interface](#student-interface)
7. [Digipog Economy](#digipog-economy)
8. [Advanced Features](#advanced-features)
9. [Technical Setup](#technical-setup)
10. [API Documentation](#api-documentation)

---

## Getting Started

### System Requirements
- Node.js 18 or higher recommended for the backend
- Node.js 20.19 or higher recommended for the official TypeScript frontend
- Modern web browser
- Internet connection for real-time features

### Quick Installation
Formbar is now split into two repositories. The backend API/socket server lives in `Formbar.js`; the official frontend lives in `Formbar.ts-client`.

Backend:

```bash
git clone https://github.com/csmith1188/Formbar.js.git
cd Formbar.js
npm install
npm run init-db
npm run migrate
npm start
```

Frontend:

```bash
git clone https://github.com/csmith1188/Formbar.ts-client.git
cd Formbar.ts-client
npm install
cp .env-template .env
npm run dev
```

Set `VITE_FORMBAR_API_URL` in the frontend `.env` to the backend URL, for example `http://localhost:420`.

### First-Time Setup
1. **Backend configuration**: Make a copy of the backend `.env-template`, rename it to `.env`, and configure server settings.
2. **Frontend configuration**: Make a copy of the frontend `.env-template`, rename it to `.env`, and set `VITE_FORMBAR_API_URL` to the backend address.
3. **Start Backend**: Run `npm start` in `Formbar.js`.
4. **Start Frontend**: Run `npm run dev` in `Formbar.ts-client`.
5. **Access**: Navigate to the frontend dev URL, usually `http://localhost:5173`.

---

## Account Management

### Creating an Account
1. Navigate to the login page
2. Click "New Account"
3. Enter your desired username and password
4. Click "Create Account" to register
5. You'll be automatically logged in after account creation

### Logging In
1. Enter your username and password
2. Click "Log In"
3. If you forget your password, use the "Forgot password" feature

### Account Types
- **Students**: Can join classes, participate in polls, request help/breaks, earn digipogs, manage pools, and transfer digipogs
- **Mods**: Can manage many classroom workflows such as polls, help tickets, breaks, tags, links, and poll sharing
- **Teachers**: Can create classes, manage sessions/students, award digipogs, control timers, and manage classroom settings
- **Managers**: Full system access including user management, logs, IP controls, and global administration

Internally, modern Formbar uses roles and scopes. Numeric permission levels are still returned for compatibility, but class access is now role-based.

---

## Class Setup

### For Teachers: Creating a Class
1. After logging in as a teacher, you'll see the class creation page
2. Enter your class name in the text field
3. Click "Create" to create and automatically join the class
4. If you have existing classes, use the dropdown to select and join them
5. Share the class code with your students

### For Students: Joining a Class
1. After logging in as a student, you'll see the class selection page
2. Enter the class code provided by your teacher
3. Click "Submit" to join the class
4. You'll be redirected to the student interface

---

## Core Features

### Navigation Bar
After logging in, you'll see these options at the top:
- **Formbar**: Main interface (Control Panel for teachers, Virtual Bar for students)
- **Panel**: Control Panel (teachers only)
- **Plugins**: Access to teacher-provided external links
- **Leave Class**: Exit current class
- **Logout**: Sign out of your account
- **LM/DM**: Toggle between Light Mode and Dark Mode
- **Manager**: System administration (managers only)

### Virtual Bar
The Virtual Bar is a real-time visual representation of poll results:
- **Pie Chart Display**: Shows poll responses with color-coded sections
- **Hover Information**: Displays detailed data when hovering over sections
- **Color Legend**: Shows which colors correspond to which answers
- **Real-time Updates**: Automatically updates as students respond

### Timer System
Teachers can set server-side timers with sound notifications:
- **Start Timer**: Set a duration through the UI or `/api/v1/class/{id}/timer/start`
- **Sound Alerts**: Optional audio notification when timer expires
- **Visual Display**: Timer state is included in live class updates
- **Control**: Start, pause, resume, end, and clear timers

---

## Teacher Controls

### Control Panel Overview
The Control Panel provides comprehensive classroom management tools with four main sections:

#### 1. Filter Options
Filter students based on various criteria:
- **Poll Responses**: Show only students who have/haven't responded
- **Help Tickets**: Filter by students with active help requests
- **Break Requests**: Show students currently on break
- **Tags**: Filter by specific student tags

#### 2. Sort Options
Organize students by:
- **Name**: Alphabetical sorting
- **Poll Responses**: Sort by poll participation
- **Help Time**: Sort by when help was requested
- **Permissions**: Sort by user permission level

#### 3. Student Selection
- **Checkboxes**: Select individual students for targeted polls
- **Bulk Selection**: Choose multiple students at once

#### 4. Fast Poll Creation
Quick poll creation with presets:
- **TUTD**: Thumbs Up/Thumbs Down
- **True/False**: Binary choice polls
- **Done/Ready**: Completion status polls
- **Multiple Choice**: Custom multiple option polls
- **Custom**: Advanced poll creation

### Advanced Poll Options

#### Poll Configuration
- **Prompt**: The question or instruction for students
- **Answer Options**: Create multiple choice responses
- **Text Responses**: Allow free-form text answers
- **Multiple Responses**: Permit multiple selections
- **Blind Polls**: Hide results from students
- **Weight**: Set point value for pog meter
- **Tags**: Restrict to students with specific tags

#### Custom Polls
1. Click "Custom" in Fast Poll section
2. Enter poll prompt
3. Set number of answer options
4. Configure advanced options:
   - Multiple answer selection
   - Text response capability
   - Blind poll mode
   - Tag requirements
   - Vote change permissions

### Student Management

#### User Permissions
Change student access through class roles:
- **Teacher-like roles**: Session, timer, student, and settings control
- **Mod-like roles**: Poll, help, break, tag, link, and sharing control
- **Student-like roles**: Standard poll/help/break participation
- **Guest**: Limited access until enrolled or promoted
- **Banned/Blocked**: Prevents class access

#### Tags System
Organize students with custom tags:
1. Click on a student in the control panel
2. Click "Tags" button
3. Select existing tags or create new ones
4. Tags enable targeted polling and organization

#### Help Ticket Management
- **View Requests**: See all help tickets in the control panel
- **Response Information**: View student's help request details
- **Time Tracking**: Monitor when tickets were submitted
- **Resolution**: Mark tickets as resolved

### Break Management
- **Approve/Deny**: Control student break requests
- **Reason Tracking**: View why students need breaks
- **Time Management**: Monitor break duration
- **Status Updates**: Real-time break status

---

## Student Interface

### Virtual Bar Experience
When no poll is active, students see "No active poll"
When polls are active, students see:
- **Poll Question**: Clear display of the current question
- **Answer Options**: Radio buttons for each choice
- **Submit Button**: Submit their response
- **Confirmation**: Pop-up confirming submission

### Help System
Students can request help:
1. Click "Help" button
2. Enter optional reason for help needed
3. Submit request
4. Teacher receives notification in Control Panel

### Break Requests
Students can request breaks:
1. Click "Take Break" button
2. Select break type:
   - **Bathroom**: Default option
   - **Other**: Custom break with reason
3. Submit request
4. Wait for teacher approval

### Poll Participation
- **Real-time Updates**: See poll results as they come in
- **Response Confirmation**: Get confirmation when vote is submitted
- **Change Votes**: Modify responses if allowed by teacher
- **Multiple Selections**: Choose multiple options if enabled

---

## Digipog Economy

### What are Digipogs?
Digipogs are the digital currency system in Formbar.js, inspired by the classic pog game. Students earn digipogs through participation and can transfer them to other users.

### Earning Digipogs
- **Poll Participation**: Earn points for responding to polls
- **Pog Meter**: Accumulate points (500 points = 1-10 random digipogs)
- **Teacher Awards**: Direct digipog awards from teachers
- **Weight System**: Higher-weighted polls provide more points

### Pog Meter System
- **Point Accumulation**: Each poll response adds 100 × weight points
- **Meter Reset**: Resets to 0 after earning digipogs
- **Random Rewards**: Earn 1-10 digipogs when meter reaches 500
- **First Response Only**: Only first response to each poll counts

### Transferring Digipogs
- **PIN Security**: Requires recipient's PIN for transfers
- **Tax System**: 10% tax on all transfers (prevents inflation)
- **Transaction Logging**: Complete audit trail of all transfers
- **Pool Transfers**: Send digipogs to shared pools

### Digipog Pools
Create shared pools for group activities:
- **Pool Creation**: Create up to 5 pools per user
- **Member Management**: Add/remove pool members
- **Equal Distribution**: Distribute pool funds equally among members
- **Direct Transfers**: Send digipogs directly to pools

---

## Advanced Features

### Custom Poll Templates
- **Save Polls**: Create reusable poll templates
- **Share Polls**: Share polls between teachers and classes
- **Public Polls**: Make polls available to all users
- **Poll History**: View and reuse previous polls

### Permission System
Granular control over user capabilities:
- **Class Permissions**: Control what students can do in class
- **Feature Access**: Enable/disable specific features
- **Role Management**: Assign different permission levels
- **Custom Permissions**: Create custom permission sets

### Timer Features
- **Server-side Timers**: Reliable countdown timers
- **Sound Notifications**: Audio alerts when timers expire
- **Visual Display**: Real-time countdown for all users
- **Timer Control**: Start, stop, and reset functionality

### Tag System
Organize and filter students:
- **Custom Tags**: Create class-specific tags
- **Tag Filtering**: Filter students by tags
- **Targeted Polling**: Create polls for specific tag groups
- **Tag Management**: Add, remove, and modify tags

### Plugin System
- **External Links**: Add links to external resources
- **Student Access**: Students can access teacher-provided links
- **Link Management**: Add, edit, and remove plugin links
- **Custom Integration**: Connect to third-party tools

---

## Technical Setup

### Development Environment
```bash
# Install dependencies
npm install

# Initialize database
npm run init-db

# Run migrations
npm run migrate

# Start development server
npm run dev

# Run tests
npm test

# Format code
npm run format
```

### Configuration
1. **Backend Environment Variables**: Configure the backend `.env` file in `Formbar.js`.
2. **Frontend Environment Variables**: Configure the frontend `.env` file in `Formbar.ts-client`.
3. **Database Settings**: SQLite database configuration is handled by the backend.
4. **Email Settings**: Configure SMTP for notifications in the backend.
5. **OIDC Settings**: Set up Google and/or Microsoft login providers in the backend (optional).
6. **IP Management**: Configure whitelist/blacklist in the backend.

### Production Deployment
- **Port Configuration**: Set PORT environment variable
- **Database Backup**: Regular database backups recommended
- **SSL Configuration**: Configure HTTPS for production
- **Logging**: Winston-based logging system included

---

## API Documentation

### REST API
Formbar.js provides a comprehensive REST API for external integrations:
- **Versioned API**: New routes live under `/api/v1`
- **Swagger Docs**: Open `/docs` on a running server for generated endpoint docs
- **User Management**: Create, update, and manage users, roles, scopes, API keys, PINs, and notifications
- **Class Operations**: Join, leave, and manage classes, roles, links, tags, timers, help, and breaks
- **Poll Management**: Create, update, respond to, and read polls
- **Digipog Operations**: Transfer and award digipogs, plus pool management

### WebSocket API
Real-time communication through WebSocket connections:
- **Live Updates**: Real-time poll results and classroom updates
- **Event Handling**: Comprehensive event system for all features
- **Permission-based**: Secure access based on roles and scopes

### Frontend Client
The official frontend is maintained separately in `Formbar.ts-client`. It is a Vite/React/TypeScript app that talks to the backend with `VITE_FORMBAR_API_URL` and connects to Socket.IO with bearer tokens.

### Documentation Files
- **WebSocket API**: See the [WebSocket API](WebSocket-API) page for socket events and examples
- **HTTP API**: See the [HTTP API](HTTP-API) page for REST examples and `/docs` for generated endpoint details
- **Digipog System**: See the [Digipogs](Digipogs) page for currency system details

---

## Troubleshooting

### Common Issues
1. **Database Errors**: Ensure database is initialized with `npm run init-db`
2. **Permission Issues**: Check user permissions and class settings
3. **Connection Problems**: Verify network connectivity and server status
4. **Poll Issues**: Check poll configuration and student permissions

### Support
- **GitHub Issues**: Report bugs and request features
- **Documentation**: Comprehensive API and feature documentation
- **Community**: Join the Formbar.js community for support

---

## License

This project is licensed under the YCSTEL-1.0 License. See the LICENSE file for details.

---

*For technical implementation details, API documentation, and advanced configuration options, refer to the specialized documentation files included with Formbar.js.*
