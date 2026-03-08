// ============================================
// AOL-STYLE CHAT ROOM - CLIENT APPLICATION
// ============================================

// Socket.IO connection
const socket = io();

// Application state
const appState = {
    username: null,
    currentRoom: null,
    userColor: null,
    pendingRoomJoin: null
};

// DOM Elements - Username Screen
const usernameScreen = document.getElementById('username-screen');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');

// DOM Elements - Room List Screen
const roomListScreen = document.getElementById('room-list-screen');
const currentUsernameDisplay = document.getElementById('current-username');
const roomList = document.getElementById('room-list');
const createRoomBtn = document.getElementById('create-room-btn');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');

// DOM Elements - Chat Screen
const chatScreen = document.getElementById('chat-screen');
const currentRoomName = document.getElementById('current-room-name');
const roomUserCount = document.getElementById('room-user-count');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const userListElement = document.getElementById('user-list');
const messageArea = document.getElementById('message-area');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');

// DOM Elements - Create Room Modal
const createRoomModal = document.getElementById('create-room-modal');
const roomNameInput = document.getElementById('room-name-input');
const roomPasswordInput = document.getElementById('room-password-input');
const createRoomSubmit = document.getElementById('create-room-submit');

// DOM Elements - Join Private Room Modal
const joinRoomModal = document.getElementById('join-room-modal');
const joiningRoomName = document.getElementById('joining-room-name');
const joinRoomPasswordInput = document.getElementById('join-room-password-input');
const joinRoomSubmit = document.getElementById('join-room-submit');

// DOM Elements - Help Menu
const helpModal = document.getElementById('help-modal');
const helpBtnUsername = document.getElementById('help-btn-username');
const helpBtnRoomList = document.getElementById('help-btn-room-list');
const helpBtnChat = document.getElementById('help-btn-chat');

// DOM Elements - Notifications
const notificationToast = document.getElementById('notification-toast');
const notificationMessage = document.getElementById('notification-message');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusText = connectionStatus.querySelector('.status-text');

// DOM Elements - Violation Screen (will be created dynamically)
let violationOverlay = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show a specific screen and hide others
 */
function showScreen(screenName) {
    const screens = [usernameScreen, roomListScreen, chatScreen];
    screens.forEach(screen => screen.classList.remove('active'));
    
    switch(screenName) {
        case 'username':
            usernameScreen.classList.add('active');
            usernameInput.focus();
            break;
        case 'room-list':
            roomListScreen.classList.add('active');
            socket.emit('get-rooms');
            break;
        case 'chat':
            chatScreen.classList.add('active');
            messageInput.focus();
            break;
    }
}

/**
 * Show notification toast
 */
function showNotification(message, isSuccess = false) {
    notificationMessage.textContent = message;
    notificationToast.classList.remove('success');
    
    if (isSuccess) {
        notificationToast.classList.add('success');
    }
    
    notificationToast.classList.add('show');
    
    setTimeout(() => {
        notificationToast.classList.remove('show');
    }, 4000);
}

/**
 * Show violation overlay when disconnected for violations
 */
function showViolationOverlay(reason, violations, isBanned = false) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'violation-overlay';
    overlay.classList.add(isBanned ? 'banned' : 'violation');
    
    const banMessage = isBanned ? `<p class="violation-warning">Your IP has been banned for 1 hour. Please try again later.</p>` : '';
    
    overlay.innerHTML = `
        <div class="violation-content ${isBanned ? 'banned-content' : ''}">
            <div class="violation-icon">${isBanned ? '🚫' : '⚠️'}</div>
            <h2>${isBanned ? 'IP Address Banned' : 'Connection Terminated'}</h2>
            <p class="violation-reason">${escapeHtml(reason)}</p>
            <p class="violation-details">Violations: ${violations}</p>
            ${banMessage}
            <p class="violation-explanation">${isBanned ? 'Your IP has been temporarily banned due to repeated violations. You can try reconnecting in 1 hour.' : 'You were disconnected due to repeated spam/rate limit violations.'}</p>
            ${isBanned ? '<button id="violation-reload-btn" class="btn btn-secondary" disabled>Try Again in 1 Hour</button>' : '<button id="violation-reload-btn" class="btn btn-primary">Refresh Page</button>'}
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listener to reload button if not banned
    if (!isBanned) {
        document.getElementById('violation-reload-btn').addEventListener('click', () => {
            location.reload();
        });
    }
}

/**
 * Show modal
 */
function showModal(modal) {
    modal.classList.add('active');
}

/**
 * Hide modal
 */
function hideModal(modal) {
    modal.classList.remove('active');
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(isConnected) {
    if (isConnected) {
        connectionStatus.classList.add('connected');
        connectionStatusText.textContent = 'Connected';
    } else {
        connectionStatus.classList.remove('connected');
        connectionStatusText.textContent = 'Disconnected';
    }
}

/**
 * Escape HTML to prevent XSS (used when rendering user content)
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// USERNAME SCREEN
// ============================================

/**
 * Handle username submission
 */
function handleUsernameSubmit() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showNotification('Please enter a username');
        return;
    }
    
    if (username.length < 2 || username.length > 20) {
        showNotification('Username must be between 2 and 20 characters');
        return;
    }
    
    appState.username = username;
    socket.emit('set-username', { username });
    currentUsernameDisplay.textContent = username;
    showScreen('room-list');
}

usernameSubmit.addEventListener('click', handleUsernameSubmit);

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleUsernameSubmit();
    }
});

// ============================================
// ROOM LIST SCREEN
// ============================================

/**
 * Render room list
 */
function renderRoomList(rooms) {
    roomList.innerHTML = '';
    
    if (rooms.length === 0) {
        roomList.innerHTML = '<p class="text-center">No rooms available</p>';
        return;
    }
    
    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        
        const roomInfo = document.createElement('div');
        roomInfo.className = 'room-item-info';
        
        const roomName = document.createElement('div');
        roomName.className = 'room-item-name';
        roomName.textContent = room.name;
        
        const roomMeta = document.createElement('div');
        roomMeta.className = 'room-item-meta';
        
        const userCount = document.createElement('span');
        userCount.textContent = `👥 ${room.userCount} user${room.userCount !== 1 ? 's' : ''}`;
        
        const badge = document.createElement('span');
        badge.className = `room-badge ${room.isPrivate ? 'private' : ''}`;
        badge.textContent = room.isPrivate ? '🔒 Private' : '🌐 Public';
        
        roomMeta.appendChild(userCount);
        roomMeta.appendChild(badge);
        
        roomInfo.appendChild(roomName);
        roomInfo.appendChild(roomMeta);
        
        roomItem.appendChild(roomInfo);
        
        roomItem.addEventListener('click', () => {
            handleRoomClick(room);
        });
        
        roomList.appendChild(roomItem);
    });
}

/**
 * Handle room item click
 */
function handleRoomClick(room) {
    if (room.isPrivate) {
        // Show password modal for private rooms
        appState.pendingRoomJoin = room.name;
        joiningRoomName.textContent = room.name;
        joinRoomPasswordInput.value = '';
        showModal(joinRoomModal);
    } else {
        // Join public room directly
        joinRoom(room.name, '');
    }
}

/**
 * Join a room
 */
function joinRoom(roomName, password) {
    socket.emit('join-room', {
        roomName: roomName,
        username: appState.username,
        password: password
    });
}

/**
 * Handle create room button
 */
createRoomBtn.addEventListener('click', () => {
    roomNameInput.value = '';
    roomPasswordInput.value = '';
    showModal(createRoomModal);
});

/**
 * Handle refresh rooms button
 */
refreshRoomsBtn.addEventListener('click', () => {
    socket.emit('get-rooms');
});

// ============================================
// CREATE ROOM MODAL
// ============================================

/**
 * Handle create room submission
 */
function handleCreateRoomSubmit() {
    const roomName = roomNameInput.value.trim();
    const password = roomPasswordInput.value;
    
    if (!roomName || roomName.length < 3 || roomName.length > 30) {
        showNotification('Room name must be between 3 and 30 characters');
        return;
    }
    
    if (!password || password.length < 4) {
        showNotification('Password must be at least 4 characters');
        return;
    }
    
    socket.emit('create-room', {
        roomName: roomName,
        password: password
    });
    
    hideModal(createRoomModal);
}

createRoomSubmit.addEventListener('click', handleCreateRoomSubmit);

roomPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleCreateRoomSubmit();
    }
});

// Modal close buttons
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        hideModal(createRoomModal);
        hideModal(joinRoomModal);
        hideModal(helpModal);
    });
});

// Close modal when clicking outside
[createRoomModal, joinRoomModal, helpModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideModal(modal);
        }
    });
});

// Help menu triggers
[helpBtnUsername, helpBtnRoomList, helpBtnChat].forEach(btn => {
    btn.addEventListener('click', () => {
        showModal(helpModal);
    });
});

// ============================================
// JOIN PRIVATE ROOM MODAL
// ============================================

/**
 * Handle join private room submission
 */
function handleJoinRoomSubmit() {
    const password = joinRoomPasswordInput.value;
    
    if (!password) {
        showNotification('Please enter a password');
        return;
    }
    
    joinRoom(appState.pendingRoomJoin, password);
    hideModal(joinRoomModal);
}

joinRoomSubmit.addEventListener('click', handleJoinRoomSubmit);

joinRoomPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleJoinRoomSubmit();
    }
});

// ============================================
// CHAT SCREEN
// ============================================

/**
 * Render user list
 */
function renderUserList(users) {
    userListElement.innerHTML = '';
    
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = `user-item user-color-${user.color}`;
        userItem.textContent = user.username;
        userListElement.appendChild(userItem);
    });
    
    // Update user count
    roomUserCount.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;
}

/**
 * Add message to chat
 */
function addMessage(username, message, color, timestamp, mentions) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    // Check if current user is mentioned
    const isMentioned = mentions && mentions.some(m => 
        m.toLowerCase() === appState.username.toLowerCase()
    );
    
    if (isMentioned) {
        messageDiv.classList.add('message-mentioned');
    }
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = `message-username user-color-${color}`;
    usernameSpan.textContent = `[${username}]:`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'message-text';
    
    // Parse message for @mentions and highlight them
    if (mentions && mentions.length > 0) {
        const parts = [];
        let lastIndex = 0;
        const mentionRegex = /@(\w+)/g;
        let match;
        
        while ((match = mentionRegex.exec(message)) !== null) {
            // Add text before mention
            if (match.index > lastIndex) {
                parts.push(document.createTextNode(message.substring(lastIndex, match.index)));
            }
            
            // Add mention as highlighted span
            const mentionSpan = document.createElement('span');
            mentionSpan.className = 'mention';
            mentionSpan.textContent = match[0];
            parts.push(mentionSpan);
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text
        if (lastIndex < message.length) {
            parts.push(document.createTextNode(message.substring(lastIndex)));
        }
        
        // Append all parts to message span
        parts.forEach(part => messageSpan.appendChild(part));
    } else {
        messageSpan.textContent = ` ${message}`;
    }
    
    messageDiv.appendChild(usernameSpan);
    messageDiv.appendChild(messageSpan);
    
    messageArea.appendChild(messageDiv);
    messageArea.scrollTop = messageArea.scrollHeight;
}

/**
 * Add whisper message to chat
 */
function addWhisperMessage(username, targetUsername, message, color, timestamp, isSender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message whisper-message';
    
    const whisperLabel = document.createElement('span');
    whisperLabel.className = 'whisper-label';
    whisperLabel.textContent = isSender ? `[Whisper to ${targetUsername}] ` : `[Whisper from ${username}] `;
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = `message-username user-color-${color}`;
    usernameSpan.textContent = `[${username}]:`;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'message-text';
    messageSpan.textContent = ` ${message}`;
    
    messageDiv.appendChild(whisperLabel);
    messageDiv.appendChild(usernameSpan);
    messageDiv.appendChild(messageSpan);
    
    messageArea.appendChild(messageDiv);
    messageArea.scrollTop = messageArea.scrollHeight;
}

/**
 * Add system message to chat
 */
function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = `*** ${message} ***`;
    
    messageArea.appendChild(messageDiv);
    messageArea.scrollTop = messageArea.scrollHeight;
}

/**
 * Handle send message
 */
function handleSendMessage() {
    const message = messageInput.value.trim();
    
    if (!message) {
        return;
    }
    
    socket.emit('send-message', {
        message: message
    });
    
    messageInput.value = '';
}

sendMessageBtn.addEventListener('click', handleSendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSendMessage();
    }
});

/**
 * Handle leave room
 */
leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leave-room');
});

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

// Connection status
socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus(true);

    if (appState.username) {
        socket.emit('set-username', { username: appState.username });
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
    showNotification('Disconnected from server');
});

socket.on('reconnect', () => {
    console.log('Reconnected to server');
    updateConnectionStatus(true);
    showNotification('Reconnected to server', true);
    
    // If user was in a room, show room list to rejoin
    if (appState.currentRoom) {
        appState.currentRoom = null;
        showScreen('room-list');
    }
});

// Room list
socket.on('room-list', (rooms) => {
    renderRoomList(rooms);
});

// Room created
socket.on('room-created', (data) => {
    showNotification(`Room "${data.roomName}" created successfully!`, true);
});

// Join success
socket.on('join-success', (data) => {
    appState.currentRoom = data.roomName;
    appState.userColor = data.color;
    
    currentRoomName.textContent = data.roomName;
    messageArea.innerHTML = '';
    
    renderUserList(data.users);
    showScreen('chat');
    
    showNotification(`Joined ${data.roomName}`, true);
});

// Left room
socket.on('left-room', () => {
    appState.currentRoom = null;
    showScreen('room-list');
    socket.emit('get-rooms');
});

// User list update
socket.on('user-list-update', (users) => {
    renderUserList(users);
});

// New message
socket.on('new-message', (data) => {
    addMessage(data.username, data.message, data.color, data.timestamp, data.mentions || []);
});

// Whisper message
socket.on('whisper-message', (data) => {
    addWhisperMessage(data.username, data.targetUsername, data.message, data.color, data.timestamp, data.isSender);
});

// System message
socket.on('system-message', (data) => {
    addSystemMessage(data.message);
});

// Kicked
socket.on('kicked', (reason) => {
    showNotification(`⚠️ ${reason}`);
    appState.currentRoom = null;
    showScreen('room-list');
    socket.emit('get-rooms');
});

// Error message
socket.on('error-message', (message) => {
    showNotification(message);
});

// Violation disconnect
socket.on('violation-disconnect', (data) => {
    showViolationOverlay(data.reason, data.violations, data.banned || false);
});

// IP banned
socket.on('ip-banned', (data) => {
    const message = `Your IP has been banned for ${data.minutesRemaining} minutes due to repeated violations`;
    showNotification(message);
});

// ============================================
// INITIALIZATION
// ============================================

// Show username screen on load
showScreen('username');

// Prevent page refresh losing username
window.addEventListener('beforeunload', (e) => {
    if (appState.currentRoom) {
        e.preventDefault();
        e.returnValue = 'You will be disconnected from the chat room. Are you sure?';
    }
});

console.log('🚀 AOL-Style Chat Room initialized');
