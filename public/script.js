let currentUserId = null;
let pollInterval = null;
let calendar = null;

const navChats = document.getElementById('navChats');
const navAgenda = document.getElementById('navAgenda');
const chatsSidebar = document.getElementById('chatsSidebar');
const chatArea = document.getElementById('chatArea');
const agendaArea = document.getElementById('agendaArea');

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

// Navigation Tabs
function switchTab(tab) {
    if (tab === 'chats') {
        navChats.classList.add('active');
        navAgenda.classList.remove('active');
        chatsSidebar.style.display = 'flex';
        chatArea.style.display = 'flex';
        agendaArea.style.display = 'none';
        
        if (currentUserId && !pollInterval) {
            pollInterval = setInterval(() => loadMessages(currentUserId, true), 5000);
        }
    } else if (tab === 'agenda') {
        navChats.classList.remove('active');
        navAgenda.classList.add('active');
        chatsSidebar.style.display = 'none';
        chatArea.style.display = 'none';
        agendaArea.style.display = 'flex';
        
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        
        initCalendar();
    }
}

// Calendar Init
async function initCalendar() {
    if (calendar) {
        // Just refresh events if already initialized
        calendar.refetchEvents();
        return;
    }
    
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        slotMinTime: "09:00:00",
        slotMaxTime: "19:00:00",
        allDaySlot: false,
        height: '100%',
        events: async function(info, successCallback, failureCallback) {
            try {
                const res = await fetch('/api/appointments');
                const appointments = await res.json();
                
                const events = appointments.map(app => {
                    const clientName = app.user.name || app.user.phone;
                    return {
                        id: app.id,
                        title: `${clientName} - ${app.reason}`,
                        start: app.date,
                        // Assumes 1 hour duration
                        end: new Date(new Date(app.date).getTime() + 60 * 60 * 1000).toISOString(),
                        description: `Motivo: ${app.reason}\nTeléfono: ${app.user.phone}\nNombre: ${app.user.name || 'N/A'}`,
                    };
                });
                successCallback(events);
            } catch (error) {
                console.error("Error fetching appointments:", error);
                failureCallback(error);
            }
        },
        eventClick: function(info) {
            alert(info.event.extendedProps.description);
        }
    });
    
    calendar.render();
}

// Start
init();
