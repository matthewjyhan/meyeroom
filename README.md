# AOL-Style Chat Room

A complete, production-ready web-based chat room application inspired by 1990s AOL chat rooms. Built with Node.js, Express, Socket.IO, and vanilla JavaScript.

![AOL Chat](https://img.shields.io/badge/Style-AOL%2090s-blue)
![Node.js](https://img.shields.io/badge/Node.js-v16+-green)
![License](https://img.shields.io/badge/License-ISC-yellow)

## Features

### Core Functionality
- **Real-time messaging** using WebSocket (Socket.IO)
- **No registration required** - temporary usernames per session
- **Public and private rooms** with password protection
- **Username color coding** (6 rotating colors)
- **System notifications** for user join/leave/kick events
- **Rate limiting** to prevent spam
- **Security features** including XSS prevention, input sanitization, and password hashing
- **Pinging and whispering** - talk to specific users

### User Experience
- Retro 90s AOL-inspired interface
- Desktop-first, mobile-friendly design
- Connection status indicator
- Enter-to-send messaging
- Real-time user list
- Room browsing with user counts

### Security
- **Bcrypt password hashing** for private rooms
- **Input sanitization** against XSS attacks
- **Server-side rate limiting** (5 messages per 10 seconds)
- **IP-based connection limits** (max 5 connections per IP)
- **Room creation limits** (max 3 rooms per IP per hour)
- **Auto-kick and disconnect** for spam violations
- **Helmet.js** for HTTP header security

## Quick Start

### Prerequisites
- Node.js v16 or higher
- npm (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/matthewjyhan/chatroom.git
   cd chatroom
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   ```
   http://localhost:3000
   ```

That's it! The chat room is now running. 
Stop the local server with:
```
pkill -f "node server.js"
```

### Custom Port

To run on a different port, set the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## 📁 Project Structure

```
chatroom/
├── server.js              # Backend server with Express & Socket.IO
├── package.json           # Node.js dependencies and scripts
├── public/                # Frontend static files
│   ├── index.html        # Main HTML structure
│   ├── css/
│   │   └── style.css     # Retro AOL-style CSS
│   └── js/
│       └── app.js        # Client-side JavaScript
└── README.md             # This file
```

## How to Use

### 1. Choose a Username
- Enter a username (2-20 characters)
- No password needed - it's temporary!

### 2. Browse Room List
- See all available public and private rooms
- User counts are displayed in real-time
- Public rooms: General, Tech, Music, College, Random

### 3. Join or Create a Room

**Join a Public Room:**
- Click on any public room to join instantly

**Join a Private Room:**
- Click on a private room
- Enter the room password
- Click "Join Room"

**Create a New Private Room:**
- Click "Create Private Room"
- Enter room name (3-30 characters)
- Set a password (minimum 4 characters)
- Click "Create Room"

### 4. Chat!
- Type messages in the input box
- Press Enter or click "Send"
- See messages appear in real-time with colored usernames
- View all users in the room on the right panel
- Ping users with @
- Whisper to users with /w
- Change your username color with /color

### 5. Leave Room
- Click "Leave Room" button
- Return to the room list
- Your username becomes available again in that room

## Security Features

### Password Security
- Private room passwords are hashed with bcrypt (10 rounds)
- Never stored or transmitted in plaintext
- Server-side validation only

### Anti-Spam Protection
- Message rate limiting: 5 messages per 3 seconds
- First violation: kicked from room
- After 2 kicks: disconnected from server
- Server-side enforcement (not client-controlled)

### XSS Prevention
- All user inputs sanitized on server-side
- HTML entities escaped
- Client-side validation as additional safety layer

### Connection Limits
- Maximum 5 concurrent connections per IP
- Maximum 3 room creations per IP per hour
- Prevents resource exhaustion attacks

## Architecture Decisions

### 1. **In-Memory Storage (No Database)**
   - **Why:** Ephemeral chat rooms require no persistence
   - **Benefit:** Simplicity, fast performance, no database setup
   - **Trade-off:** Data lost on server restart (by design)

### 2. **Socket.IO for WebSockets**
   - **Why:** Reliable, auto-reconnection, fallback support
   - **Benefit:** Real-time bidirectional communication
   - **Alternative considered:** Native WebSocket (chose Socket.IO for ease of use)

### 3. **Vanilla JavaScript Frontend**
   - **Why:** No framework overhead for this use case
   - **Benefit:** Lightweight, fast, easy to understand
   - **Alternative considered:** React (unnecessary complexity for this project)

### 4. **Server-Side Rate Limiting**
   - **Why:** Client-side can be bypassed
   - **Benefit:** True protection against spam
   - **Implementation:** Message counting per socket with time windows

### 5. **Color Assignment by Join Order**
   - **Why:** Simple, deterministic, fair distribution
   - **Benefit:** 6 colors cycle through users
   - **Format:** Red, Orange, Yellow, Green, Blue, Violet (no Indigo per specs)

### 6. **Bcrypt for Password Hashing**
   - **Why:** Industry standard, slow hash (resistant to brute force)
   - **Benefit:** Even server operator cannot see passwords
   - **Configuration:** 10 salt rounds (good balance)

### 7. **Automatic Room Cleanup**
   - **Why:** Prevent memory leaks
   - **Benefit:** Empty private rooms deleted automatically
   - **Note:** Public rooms persist

## Configuration

### Rate Limiting Configuration
Edit [server.js](server.js):

```javascript
const MESSAGE_RATE_LIMIT = 5;           // messages allowed
const MESSAGE_RATE_WINDOW = 3000;      // time window (ms)
const MAX_KICKS_BEFORE_DISCONNECT = 2;  // kicks before disconnect
const MAX_CONNECTIONS_PER_IP = 5;       // connections per IP
const MAX_ROOM_CREATIONS_PER_IP_PER_HOUR = 3;  // room creation limit
```

### Default Public Rooms
Edit [server.js](server.js) to add/remove public rooms.

### Username Colors
Edit [server.js](server.js) to change color rotation:

```javascript
const USER_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'violet'];
```

## Customization

### Styling
- Edit [public/css/style.css](public/css/style.css)
- CSS variables defined at top for easy theming
- Responsive breakpoints at 768px and 480px

### Message Format
Messages always appear as: `[Username]: Message`

This format is enforced and cannot be changed per specifications.


**Enjoy chatting like it's 1999! 🎉**

Built March 1st, 2026
