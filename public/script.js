let currentUserId = null;
let pollInterval = null;

const contactsList = document.getElementById('contactsList');
const messagesContainer = document.getElementById('messagesContainer');
const chatHeader = document.getElementById('chatHeader');
const chatUserName = document.getElementById('chatUserName');
const chatUserPhone = document.getElementById('chatUserPhone');
const searchInput = document.getElementById('searchInput');

// Initialize
async function init() {
    await loadUsers();
    
    searchInput.addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });
}

// Fetch users from API
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        renderUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsers(users) {
    contactsList.innerHTML = '';
    
    if (users.length === 0) {
        contactsList.innerHTML = '<div style="padding: 20px; color: #8696a0; text-align: center;">No hay conversaciones.</div>';
        return;
    }

    users.forEach(user => {
        const div = document.createElement('div');
        div.className = `contact-item ${currentUserId === user.id ? 'active' : ''}`;
        div.dataset.userId = user.id;
        div.dataset.search = (user.name || user.phone).toLowerCase();
        
        const initial = (user.name ? user.name.charAt(0) : user.phone.charAt(0)).toUpperCase();
        
        div.innerHTML = `
            <div class="avatar-placeholder">${initial}</div>
            <div class="contact-info">
                <div class="contact-name">${user.name || 'Desconocido'}</div>
                <div class="contact-phone">${user.phone}</div>
            </div>
        `;
        
        div.addEventListener('click', () => selectUser(user));
        contactsList.appendChild(div);
    });
}

function filterUsers(query) {
    const q = query.toLowerCase();
    const items = contactsList.querySelectorAll('.contact-item');
    items.forEach(item => {
        if (item.dataset.search.includes(q)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function selectUser(user) {
    currentUserId = user.id;
    
    // Update UI active state
    document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.contact-item[data-user-id="${user.id}"]`);
    if (activeEl) activeEl.classList.add('active');
    
    // Update Header
    chatHeader.style.display = 'flex';
    chatUserName.textContent = user.name || 'Desconocido';
    chatUserPhone.textContent = user.phone;
    
    const initial = (user.name ? user.name.charAt(0) : user.phone.charAt(0)).toUpperCase();
    chatHeader.querySelector('.avatar-placeholder').textContent = initial;
    
    // Load Messages
    loadMessages(user.id);
    
    // Start Polling
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => loadMessages(user.id, true), 5000);
}

async function loadMessages(userId, silent = false) {
    try {
        const response = await fetch(`/api/users/${userId}/messages`);
        const messages = await response.json();
        renderMessages(messages, silent);
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function renderMessages(messages, silent) {
    if (!silent) {
        messagesContainer.innerHTML = '';
    }
    
    // If silent (polling), only update if there are new messages.
    // A simple way to check is comparing the length if we store it.
    // For simplicity here, we'll re-render if it's not silent or if the length changed.
    const currentMsgCount = messagesContainer.querySelectorAll('.message').length;
    
    if (silent && messages.length === currentMsgCount) {
        return; // no new messages
    }
    
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="empty-state">No hay mensajes en esta conversación.</div>';
        return;
    }
    
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.role}`; // 'user' or 'assistant'
        
        const date = new Date(msg.createdAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Convert line breaks to <br> for proper rendering
        const content = msg.content.replace(/\n/g, '<br>');
        
        div.innerHTML = `
            <div class="message-content">${content}</div>
            <span class="message-time">${timeStr}</span>
        `;
        
        messagesContainer.appendChild(div);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Start
init();
