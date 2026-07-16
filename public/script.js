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
const navLinks = document.getElementById('navLinks');

// Mobile Menu Toggle
function toggleMobileMenu() {
    navLinks.classList.toggle('show');
}

// Sidebar toggle on mobile
function toggleSidebar() {
    if (window.innerWidth <= 768) {
        chatsSidebar.classList.toggle('open');
    }
}

// Open sidebar initially on mobile if in chats view
function initMobileView() {
    if (window.innerWidth <= 768 && navChats.classList.contains('active')) {
        chatsSidebar.classList.add('open');
    }
}

// Initialize
async function init() {
    await loadUsers();
    
    searchInput.addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });
    
    initMobileView();
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
        contactsList.innerHTML = '<div style="padding: 20px; color: var(--text-secondary); text-align: center;">No hay conversaciones.</div>';
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
                <div class="contact-phone"><i class='bx bx-phone'></i> ${user.phone}</div>
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
    chatUserPhone.innerHTML = `<i class='bx bx-phone'></i> ${user.phone}`;
    
    const initial = (user.name ? user.name.charAt(0) : user.phone.charAt(0)).toUpperCase();
    document.getElementById('chatAvatar').textContent = initial;
    
    // Load Messages
    loadMessages(user.id);
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        chatsSidebar.classList.remove('open');
    }
    
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
    
    const currentMsgCount = messagesContainer.querySelectorAll('.message').length;
    
    if (silent && messages.length === currentMsgCount) {
        return; 
    }
    
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class='bx bx-message-square-dots'></i></div>
                <p>No hay mensajes en esta conversación.</p>
            </div>
        `;
        return;
    }
    
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.role}`; 
        
        const date = new Date(msg.createdAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const content = msg.content.replace(/\n/g, '<br>');
        
        div.innerHTML = `
            <div class="message-content">${content}</div>
            <span class="message-time">${timeStr}</span>
        `;
        
        messagesContainer.appendChild(div);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Navigation Tabs
function switchTab(tab) {
    navLinks.classList.remove('show'); // close mobile nav
    
    if (tab === 'chats') {
        navChats.classList.add('active');
        navAgenda.classList.remove('active');
        chatsSidebar.style.display = 'flex';
        chatArea.style.display = 'flex';
        agendaArea.style.display = 'none';
        
        if (window.innerWidth <= 768 && !currentUserId) {
            chatsSidebar.classList.add('open');
        }
        
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
        if (calendar) {
            setTimeout(() => {
                calendar.render();
            }, 50);
        }
    }
}

// Calendar Init
async function initCalendar() {
    if (calendar) {
        calendar.refetchEvents();
        return;
    }
    
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        timeZone: 'UTC',
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek' // Added listWeek for List view
        },
        buttonText: {
            today:    'Hoy',
            month:    'Mes',
            week:     'Semana',
            day:      'Día',
            list:     'Lista'
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
                        end: new Date(new Date(app.date).getTime() + 60 * 60 * 1000).toISOString(),
                        description: `
                            <div style="margin-bottom: 8px;"><strong><i class='bx bx-user'></i> Cliente:</strong> ${app.user.name || 'N/A'}</div>
                            <div style="margin-bottom: 8px;"><strong><i class='bx bx-phone'></i> Teléfono:</strong> ${app.user.phone}</div>
                            <div style="margin-bottom: 8px;"><strong><i class='bx bx-wrench'></i> Motivo:</strong> ${app.reason}</div>
                        `,
                    };
                });
                successCallback(events);
            } catch (error) {
                console.error("Error fetching appointments:", error);
                failureCallback(error);
            }
        },
        eventClick: function(info) {
            const modal = document.getElementById('appointmentModal');
            const descEl = document.getElementById('modalDescription');
            
            // Render nice formatted description
            descEl.innerHTML = `
                <div style="margin-bottom: 15px; font-size: 1.1rem; color: var(--accent);">
                    <strong><i class='bx bx-time-five'></i> Horario:</strong><br> 
                    ${info.event.start.toLocaleString()}
                </div>
                <div>${info.event.extendedProps.description}</div>
            `;
            
            modal.style.display = 'flex';
        }
    });
    
    calendar.render();
}

function closeModal() {
    document.getElementById('appointmentModal').style.display = 'none';
}

// Start
init();
