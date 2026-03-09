const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for simplicity
}));

// Serve static files
app.use(express.static('public'));

// Port configuration
const PORT = process.env.PORT || 3000;

// ============================================
// DATA STRUCTURES (In-Memory, Ephemeral)
// ============================================

// Rooms structure: { roomName: { isPrivate, passwordHash, users: {socketId: {username, color}}, messages: [] } }
const rooms = {
    'General': {
        isPrivate: false,
        passwordHash: null,
        users: {},
        messages: []
    },
    'Tech': {
        isPrivate: false,
        passwordHash: null,
        users: {},
        messages: []
    },
    'Music': {
        isPrivate: false,
        passwordHash: null,
        users: {},
        messages: []
    },
    'College': {
        isPrivate: false,
        passwordHash: null,
        users: {},
        messages: []
    },
    'Random': {
        isPrivate: false,
        passwordHash: null,
        users: {},
        messages: []
    }
};

// Track user sessions: { socketId: { username, currentRoom, ip, messageCount, lastMessageTime, kickCount } }
const users = {};

// IP-based rate limiting
const ipLimits = {}; // { ip: { roomCreations: count, lastRoomCreation: timestamp, connections: count } }

// IP-based banning for violations: { ip: timestamp }
const bannedIPs = {}; // Bans are temporary (1 hour)

// Username colors (6 colors, excluding indigo)
const USER_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'violet'];

// Rate limiting configuration
const MESSAGE_RATE_LIMIT = 5; // messages per window
const MESSAGE_RATE_WINDOW = 3000; // 3 seconds
const MAX_KICKS_BEFORE_DISCONNECT = 2;
const MAX_CONNECTIONS_PER_IP = 5;
const MAX_ROOM_CREATIONS_PER_IP_PER_HOUR = 3;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sanitize user input for usernames and room names (prevents XSS in identifiers)
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim()
        .substring(0, 500); // Max length limit
}

/**
 * Validate and limit message length (messages are escaped client-side during rendering)
 */
function validateMessage(input) {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, 500);
}

/**
 * Assign a color to a user based on room position
 */
function assignUserColor(roomName) {
    const room = rooms[roomName];
    if (!room) return USER_COLORS[0];
    
    const userCount = Object.keys(room.users).length;
    return USER_COLORS[userCount % USER_COLORS.length];
}

/**
 * Check if username is available in a room
 */
function isUsernameAvailable(username, roomName) {
    const room = rooms[roomName];
    if (!room) return false;
    
    return !Object.values(room.users).some(user => user.username === username);
}

/**
 * Check rate limiting for messages
 */
function checkMessageRateLimit(socketId) {
    const user = users[socketId];
    if (!user) return false;
    
    const now = Date.now();
    const timeSinceLastMessage = now - (user.lastMessageTime || 0);
    
    // Reset count if outside the window
    if (timeSinceLastMessage > MESSAGE_RATE_WINDOW) {
        user.messageCount = 0;
    }
    
    user.messageCount = (user.messageCount || 0) + 1;
    user.lastMessageTime = now;
    
    return user.messageCount > MESSAGE_RATE_LIMIT;
}

/**
 * Check IP-based connection limits
 */
function checkIPConnectionLimit(ip) {
    if (!ipLimits[ip]) {
        ipLimits[ip] = { connections: 0, roomCreations: 0, lastRoomCreation: 0 };
    }
    
    return ipLimits[ip].connections >= MAX_CONNECTIONS_PER_IP;
}

/**
 * Check IP-based room creation limits
 */
function checkIPRoomCreationLimit(ip) {
    if (!ipLimits[ip]) {
        ipLimits[ip] = { connections: 0, roomCreations: 0, lastRoomCreation: 0 };
    }
    
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    // Reset if more than an hour has passed
    if (now - ipLimits[ip].lastRoomCreation > oneHour) {
        ipLimits[ip].roomCreations = 0;
    }
    
    return ipLimits[ip].roomCreations >= MAX_ROOM_CREATIONS_PER_IP_PER_HOUR;
}

/**
 * Get client IP address
 */
function getClientIP(socket) {
    return socket.handshake.headers['x-forwarded-for'] || 
           socket.handshake.address || 
           '0.0.0.0';
}

/**
 * Check if an IP is banned and clean up expired bans
 */
function isIPBanned(ip) {
    if (!bannedIPs[ip]) {
        return false;
    }
    
    const now = Date.now();
    const banDuration = 60 * 60 * 1000; // 1 hour
    
    // Check if ban has expired
    if (now - bannedIPs[ip] > banDuration) {
        delete bannedIPs[ip];
        console.log(`Ban expired for IP: ${ip}`);
        return false;
    }
    
    return true;
}

/**
 * Get time remaining on IP ban (in minutes)
 */
function getBanTimeRemaining(ip) {
    if (!bannedIPs[ip]) {
        return 0;
    }
    
    const now = Date.now();
    const banDuration = 60 * 60 * 1000; // 1 hour
    const timeRemaining = bannedIPs[ip] + banDuration - now;
    
    return Math.ceil(timeRemaining / (60 * 1000)); // Convert to minutes
}

/**
 * Ban an IP address for 1 hour
 */
function banIP(ip) {
    bannedIPs[ip] = Date.now();
    console.log(`IP banned for 1 hour: ${ip}`);
}

/**
 * Clean up empty private rooms
 */
function cleanupEmptyRooms() {
    Object.keys(rooms).forEach(roomName => {
        const room = rooms[roomName];
        // Don't delete default public rooms
        const defaultRooms = ['General', 'Tech', 'Music', 'College', 'Random'];
        
        if (!defaultRooms.includes(roomName) && 
            room.isPrivate && 
            Object.keys(room.users).length === 0) {
            delete rooms[roomName];
        }
    });
}

/**
 * Get list of rooms with user counts, sorted by active users (descending)
 */
function getRoomList() {
    return Object.keys(rooms)
        .map(roomName => ({
            name: roomName,
            isPrivate: rooms[roomName].isPrivate,
            userCount: Object.keys(rooms[roomName].users).length
        }))
        .sort((a, b) => b.userCount - a.userCount); // Sort by user count, highest first
}

/**
 * Broadcast system message to a room
 */
function broadcastSystemMessage(roomName, message) {
    io.to(roomName).emit('system-message', {
        message: message, // System messages are safe, generated by server
        timestamp: Date.now()
    });
}

/**
 * Get users in a room
 */
function getRoomUsers(roomName) {
    const room = rooms[roomName];
    if (!room) return [];
    
    return Object.values(room.users).map(user => ({
        username: user.username,
        color: user.color
    }));
}

/**
 * Find socket ID by username in a room (case-insensitive)
 */
function findSocketByUsername(roomName, username) {
    const room = rooms[roomName];
    if (!room) return null;
    
    const lowerUsername = username.toLowerCase();
    const socketId = Object.keys(room.users).find(sid => 
        room.users[sid].username.toLowerCase() === lowerUsername
    );
    
    return socketId || null;
}

/**
 * Parse whisper command from message
 * Returns { isWhisper: boolean, targetUsername: string, message: string }
 */
function parseWhisperCommand(message) {
    const whisperRegex = /^\/w\s+@(\S+)\s+(.+)$/i;
    const match = message.match(whisperRegex);
    
    if (match) {
        return {
            isWhisper: true,
            targetUsername: match[1],
            message: match[2]
        };
    }
    
    return { isWhisper: false, targetUsername: null, message: message };
}

/**
 * Extract mentions from message (all @username patterns)
 * Returns array of usernames
 */
function extractMentions(message) {
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(message)) !== null) {
        mentions.push(match[1]);
    }
    
    return mentions;
}

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

io.on('connection', (socket) => {
    const clientIP = getClientIP(socket);
    
    // Check if IP is banned
    if (isIPBanned(clientIP)) {
        const banTimeRemaining = getBanTimeRemaining(clientIP);
        socket.emit('ip-banned', {
            reason: `Your IP has been temporarily banned for 1 hour due to repeated violations`,
            minutesRemaining: banTimeRemaining
        });
        socket.disconnect();
        return;
    }
    
    // Check IP connection limit
    if (checkIPConnectionLimit(clientIP)) {
        socket.emit('error-message', 'Too many connections from your IP address');
        socket.disconnect();
        return;
    }
    
    // Track IP connection
    if (!ipLimits[clientIP]) {
        ipLimits[clientIP] = { connections: 0, roomCreations: 0, lastRoomCreation: 0 };
    }
    ipLimits[clientIP].connections++;
    
    // Initialize user session
    users[socket.id] = {
        username: null,
        currentRoom: null,
        ip: clientIP,
        messageCount: 0,
        lastMessageTime: 0,
        kickCount: 0
    };
    
    console.log(`New connection: ${socket.id} from ${clientIP}`);
    
    // Handle disconnection
    socket.on('disconnect', () => {
        const user = users[socket.id];
        
        if (user && user.currentRoom) {
            const room = rooms[user.currentRoom];
            if (room) {
                // Remove user from room
                delete room.users[socket.id];
                
                // Broadcast leave message
                broadcastSystemMessage(user.currentRoom, `${user.username} has left the room`);
                
                // Update user list for room
                io.to(user.currentRoom).emit('user-list-update', getRoomUsers(user.currentRoom));
            }
            
            socket.leave(user.currentRoom);
        }
        
        // Cleanup
        if (ipLimits[clientIP]) {
            ipLimits[clientIP].connections = Math.max(0, ipLimits[clientIP].connections - 1);
        }
        delete users[socket.id];
        cleanupEmptyRooms();
        
        console.log(`Disconnection: ${socket.id}`);
    });
    
    // Request room list
    socket.on('get-rooms', () => {
        socket.emit('room-list', getRoomList());
    });

    // Set username for this session
    socket.on('set-username', (data) => {
        const submittedUsername = sanitizeInput(data?.username || '');

        if (!submittedUsername || submittedUsername.length < 2 || submittedUsername.length > 20) {
            socket.emit('error-message', 'Username must be between 2 and 20 characters');
            return;
        }

        const user = users[socket.id];
        if (user) {
            user.username = submittedUsername;
        }
    });
    
    // Create private room
    socket.on('create-room', async (data) => {
        try {
            const roomName = sanitizeInput(data.roomName);
            const password = data.password;
            const user = users[socket.id];
            const username = user?.username;
            
            // Validate input
            if (!roomName || roomName.length < 3 || roomName.length > 30) {
                socket.emit('error-message', 'Room name must be between 3 and 30 characters');
                return;
            }

            if (!username || username.length < 2 || username.length > 20) {
                socket.emit('error-message', 'Please set a username before creating a room');
                return;
            }
            
            if (!password || password.length < 4) {
                socket.emit('error-message', 'Password must be at least 4 characters');
                return;
            }
            
            // Check if room already exists
            if (rooms[roomName]) {
                socket.emit('error-message', 'Room name already exists');
                return;
            }
            
            // Check IP rate limit for room creation
            if (checkIPRoomCreationLimit(clientIP)) {
                socket.emit('error-message', 'Too many room creations. Please try again later.');
                return;
            }
            
            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);
            
            // Create room
            rooms[roomName] = {
                isPrivate: true,
                passwordHash: passwordHash,
                users: {},
                messages: []
            };

            // Leave current room if in one
            if (user && user.currentRoom) {
                const oldRoom = rooms[user.currentRoom];
                if (oldRoom) {
                    delete oldRoom.users[socket.id];
                    broadcastSystemMessage(user.currentRoom, `${user.username} has left the room`);
                    io.to(user.currentRoom).emit('user-list-update', getRoomUsers(user.currentRoom));
                }
                socket.leave(user.currentRoom);
            }

            // Auto-join creator to the new private room
            const color = assignUserColor(roomName);
            rooms[roomName].users[socket.id] = { username, color };

            if (user) {
                user.username = username;
                user.currentRoom = roomName;
                user.messageCount = 0;
                user.lastMessageTime = 0;
            }

            socket.join(roomName);
            
            // Update IP limits
            ipLimits[clientIP].roomCreations++;
            ipLimits[clientIP].lastRoomCreation = Date.now();
            
            socket.emit('room-created', { roomName });

            socket.emit('join-success', {
                roomName,
                username,
                color,
                users: getRoomUsers(roomName)
            });

            broadcastSystemMessage(roomName, `${username} has joined the room`);
            socket.to(roomName).emit('user-list-update', getRoomUsers(roomName));
            
            // Broadcast updated room list to all clients
            io.emit('room-list', getRoomList());
            
            console.log(`Room created and joined: ${roomName} by ${username} (${socket.id})`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error-message', 'Failed to create room');
        }
    });
    
    // Join room
    socket.on('join-room', async (data) => {
        try {
            const roomName = sanitizeInput(data.roomName);
            const username = sanitizeInput(data.username);
            const password = data.password || '';
            
            // Validate room exists
            if (!rooms[roomName]) {
                socket.emit('error-message', 'Room does not exist');
                return;
            }
            
            const room = rooms[roomName];
            
            // Validate username
            if (!username || username.length < 2 || username.length > 20) {
                socket.emit('error-message', 'Username must be between 2 and 20 characters');
                return;
            }
            
            // Check if username is available in this room
            if (!isUsernameAvailable(username, roomName)) {
                socket.emit('error-message', 'Username already taken in this room');
                return;
            }
            
            // Check password for private rooms
            if (room.isPrivate) {
                const passwordMatch = await bcrypt.compare(password, room.passwordHash);
                if (!passwordMatch) {
                    socket.emit('error-message', 'Incorrect password');
                    return;
                }
            }
            
            // Leave current room if in one
            const user = users[socket.id];
            if (user.currentRoom) {
                const oldRoom = rooms[user.currentRoom];
                if (oldRoom) {
                    delete oldRoom.users[socket.id];
                    broadcastSystemMessage(user.currentRoom, `${user.username} has left the room`);
                    io.to(user.currentRoom).emit('user-list-update', getRoomUsers(user.currentRoom));
                }
                socket.leave(user.currentRoom);
            }
            
            // Assign color and join room
            const color = assignUserColor(roomName);
            room.users[socket.id] = { username, color };
            
            // Update user session
            user.username = username;
            user.currentRoom = roomName;
            user.messageCount = 0;
            user.lastMessageTime = 0;
            
            // Join socket room
            socket.join(roomName);
            
            // Send join confirmation to user
            socket.emit('join-success', {
                roomName,
                username,
                color,
                users: getRoomUsers(roomName)
            });
            
            // Broadcast join message to others
            broadcastSystemMessage(roomName, `${username} has joined the room`);
            
            // Update user list for all in room
            socket.to(roomName).emit('user-list-update', getRoomUsers(roomName));
            
            console.log(`${username} (${socket.id}) joined ${roomName}`);
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error-message', 'Failed to join room');
        }
    });
    
    // Send message
    socket.on('send-message', (data) => {
        const user = users[socket.id];
        
        if (!user || !user.currentRoom || !user.username) {
            socket.emit('error-message', 'You must be in a room to send messages');
            return;
        }
        
        const message = validateMessage(data.message); // Validate but don't escape
        
        if (!message || message.length === 0) {
            return;
        }
        
        // Check rate limiting
        if (checkMessageRateLimit(socket.id)) {
            // Kick user from room
            const room = rooms[user.currentRoom];
            if (room) {
                delete room.users[socket.id];
                broadcastSystemMessage(user.currentRoom, `${user.username} was kicked for spamming`);
                io.to(user.currentRoom).emit('user-list-update', getRoomUsers(user.currentRoom));
            }
            
            socket.leave(user.currentRoom);
            socket.emit('kicked', 'You were kicked for sending messages too quickly');
            
            user.kickCount++;
            user.currentRoom = null;
            
            // Disconnect if kicked multiple times
            if (user.kickCount >= MAX_KICKS_BEFORE_DISCONNECT) {
                // Ban the IP for 1 hour
                banIP(user.ip);
                
                socket.emit('violation-disconnect', {
                    reason: 'You have been disconnected for repeated violations (spamming)',
                    violations: user.kickCount,
                    banned: true
                });
                // Give client time to receive and display message before closing
                setTimeout(() => {
                    socket.disconnect();
                }, 1000);
            }
            
            return;
        }
        
        // Parse for whisper command
        const whisperData = parseWhisperCommand(message);
        
        if (whisperData.isWhisper) {
            // Handle whisper message
            const targetSocketId = findSocketByUsername(user.currentRoom, whisperData.targetUsername);
            
            if (!targetSocketId) {
                socket.emit('error-message', `User "${whisperData.targetUsername}" not found in this room`);
                return;
            }
            
            if (targetSocketId === socket.id) {
                socket.emit('error-message', 'You cannot whisper to yourself');
                return;
            }
            
            const targetUser = rooms[user.currentRoom].users[targetSocketId];
            
            // Send whisper to sender
            socket.emit('whisper-message', {
                username: user.username,
                targetUsername: targetUser.username,
                message: whisperData.message,
                color: rooms[user.currentRoom].users[socket.id].color,
                timestamp: Date.now(),
                isSender: true
            });
            
            // Send whisper to recipient
            io.to(targetSocketId).emit('whisper-message', {
                username: user.username,
                targetUsername: targetUser.username,
                message: whisperData.message,
                color: rooms[user.currentRoom].users[socket.id].color,
                timestamp: Date.now(),
                isSender: false
            });
            
            console.log(`Whisper in ${user.currentRoom} from ${user.username} to ${targetUser.username}: ${whisperData.message}`);
        } else {
            // Handle regular message with mentions
            const mentions = extractMentions(message);
            
            // Broadcast message to room
            const messageData = {
                username: user.username,
                message: message,
                color: rooms[user.currentRoom].users[socket.id].color,
                timestamp: Date.now(),
                mentions: mentions
            };
            
            io.to(user.currentRoom).emit('new-message', messageData);
            
            console.log(`Message in ${user.currentRoom} from ${user.username}: ${message}`);
        }
    });
    
    // Change user color
    socket.on('change-color', (data) => {
        const user = users[socket.id];
        
        if (!user || !user.currentRoom) {
            socket.emit('color-changed', {
                success: false,
                message: 'You must be in a room to change color'
            });
            return;
        }
        
        const requestedColor = sanitizeInput(data.color || '').toLowerCase();
        
        if (!USER_COLORS.includes(requestedColor)) {
            socket.emit('color-changed', {
                success: false,
                message: `Invalid color. Available colors: ${USER_COLORS.join(', ')}`
            });
            return;
        }
        
        // Update user color in room
        const room = rooms[user.currentRoom];
        if (room && room.users[socket.id]) {
            room.users[socket.id].color = requestedColor;
            
            // Broadcast updated user list to all users in room
            io.to(user.currentRoom).emit('user-list-update', getRoomUsers(user.currentRoom));
            
            // Send success to user
            socket.emit('color-changed', {
                success: true,
                color: requestedColor,
                message: `Color changed to ${requestedColor}`
            });
            
            // Broadcast system message
            broadcastSystemMessage(user.currentRoom, `${user.username} changed their color to ${requestedColor}`);
            
            console.log(`${user.username} (${socket.id}) changed color to ${requestedColor}`);
        }
    });
    
    // Leave room
    socket.on('leave-room', () => {
        const user = users[socket.id];
        
        if (!user || !user.currentRoom) {
            return;
        }
        
        const room = rooms[user.currentRoom];
        if (room) {
            delete room.users[socket.id];
            broadcastSystemMessage(user.currentRoom, `${user.username} has left the room`);
            io.to(user.currentRoom).emit('user-list-update', getRoomUsers(user.currentRoom));
        }
        
        socket.leave(user.currentRoom);
        socket.emit('left-room');
        
        user.currentRoom = null;
        
        cleanupEmptyRooms();
    });
});

// ============================================
// HTTP ROUTES
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
    console.log(`🚀 AOL-Style Chat Server running on http://localhost:${PORT}`);
    console.log(`📝 Default rooms: General, Tech, Music, College, Random`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
    });
});
