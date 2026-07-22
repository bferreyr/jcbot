let currentUserId = null;
let pollInterval = null;
let calendar = null;
let allUsers = [];
let currentUserData = null;

const navChats = document.getElementById('navChats');
const navAgenda = document.getElementById('navAgenda');
const navMetrics = document.getElementById('navMetrics');
const chatsSidebar = document.getElementById('chatsSidebar');
const chatArea = document.getElementById('chatArea');
const agendaArea = document.getElementById('agendaArea');
const metricsArea = document.getElementById('metricsArea');

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
    await loadMe();
    applyRoles();
    
    // Default tab logic based on role
    if (currentUserData?.role === 'JUNIOR') {
        switchTab('agenda');
    }

    if (currentUserData?.role !== 'JUNIOR') {
        await loadUsers();
    } else {
        // If junior, just init calendar
        initCalendar();
    }
    
    searchInput.addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });
    
    initMobileView();
}

async function loadMe() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const data = await res.json();
        currentUserData = data.user;
    } catch (e) {
        console.error(e);
    }
}

function applyRoles() {
    if (!currentUserData) return;
    const role = currentUserData.role;
    
    if (role === 'ADMIN') {
        document.getElementById('navMetrics').style.display = 'flex';
        document.getElementById('navStaff').style.display = 'flex';
    }
    
    if (role === 'JUNIOR') {
        document.getElementById('navChats').style.display = 'none';
        document.getElementById('chatsSidebar').style.display = 'none';
        document.getElementById('chatArea').style.display = 'none';
    }
    
    if (role === 'JUNIOR' || role === 'EXPERTO') {
        document.getElementById('btnNewCampaign').style.display = 'none';
        document.getElementById('chatInputArea').style.display = 'none';
        document.getElementById('botToggleWrapper').style.display = 'none';
    }
}

// Fetch users from API
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const users = await response.json();
        allUsers = users;
        renderUsers(users);
        renderContactsTable(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (e) {
        console.error("Error logging out", e);
    }
}

function renderContactsTable(users) {
    const tbody = document.getElementById('contactsTableBody');
    if (!tbody) return; // Si no estamos en la vista de métricas o no cargó
    
    tbody.innerHTML = '';
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No hay contactos registrados.</td></tr>';
        return;
    }
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        const statusClass = (user.status || 'LEAD').toLowerCase();
        
        const messageCount = user._count?.messages || 0;
        const appointmentCount = user._count?.appointments || 0;
        const displayName = user.name || user.phone;
        
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class='bx bx-user' style="color:var(--text-secondary)"></i>
                    ${displayName}
                </div>
            </td>
            <td><span class="status-badge ${statusClass}">${user.status || 'LEAD'}</span></td>
            <td>${messageCount} <i class='bx bx-message-rounded-dots' style="color:var(--text-secondary)"></i></td>
            <td>${appointmentCount} <i class='bx bx-calendar' style="color:var(--text-secondary)"></i></td>
        `;
        tbody.appendChild(tr);
    });
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
        
        const statusClass = (user.status || 'LEAD').toLowerCase();
        
        let sentimentEmoji = '';
        if (user.sentiment === 'FELIZ') sentimentEmoji = '😊';
        else if (user.sentiment === 'FRUSTRADO') sentimentEmoji = '😠';
        
        const urgencyIcon = user.isUrgent ? `<i class='bx bxs-error urgency-indicator' title="Urgente"></i>` : '';
        
        div.innerHTML = `
            <div class="avatar-placeholder">${initial}</div>
            <div class="contact-info">
                <div class="contact-name">
                    ${user.name || 'Desconocido'}
                    <span class="status-badge ${statusClass}">${user.status || 'LEAD'}</span>
                    <span class="sentiment-icon">${sentimentEmoji}</span>
                    ${urgencyIcon}
                </div>
                <div class="contact-phone"><i class='bx bx-phone'></i> ${user.phone}</div>
                ${user.lastIntent ? `<div class="contact-intent"><i class='bx bx-target-lock'></i> ${user.lastIntent}</div>` : ''}
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
    document.getElementById('chatInputArea').style.display = 'flex';
    chatUserName.textContent = user.name || 'Desconocido';
    chatUserPhone.innerHTML = `<i class='bx bx-phone'></i> ${user.phone}`;
    
    // Toggle state
    const botToggle = document.getElementById('botToggle');
    const botStatusText = document.getElementById('botStatusText');
    botToggle.checked = !user.botPaused;
    botStatusText.textContent = user.botPaused ? 'Bot Pausado' : 'Bot Activo';
    
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
        let msgClass = msg.role;
        if (msg.isHuman) msgClass += ' human';
        div.className = `message ${msgClass}`; 
        
        const date = new Date(msg.createdAt);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const content = msg.content.replace(/\n/g, '<br>');
        
        let sentByHTML = '';
        if (msg.isHuman && msg.sentByName) {
            sentByHTML = `<div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); margin-top: 5px;"><i class='bx bx-user'></i> Enviado por: ${msg.sentByName}</div>`;
        }
        
        div.innerHTML = `
            <div class="message-content">${content}${sentByHTML}</div>
            <span class="message-time">${timeStr}</span>
        `;
        
        messagesContainer.appendChild(div);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Navigation Tabs
function switchTab(tab) {
    navLinks.classList.remove('show'); // close mobile nav
    
    navChats.classList.remove('active');
    navAgenda.classList.remove('active');
    navMetrics.classList.remove('active');
    if (document.getElementById('navStaff')) document.getElementById('navStaff').classList.remove('active');
    
    chatsSidebar.style.display = 'none';
    chatArea.style.display = 'none';
    agendaArea.style.display = 'none';
    metricsArea.style.display = 'none';
    document.getElementById('staffArea').style.display = 'none';
    
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    
    if (tab === 'chats') {
        if (currentUserData?.role === 'JUNIOR') return; // Bloqueado
        navChats.classList.add('active');
        chatsSidebar.style.display = 'flex';
        chatArea.style.display = 'flex';
        
        if (window.innerWidth <= 768 && !currentUserId) {
            chatsSidebar.classList.add('open');
        }
        
        if (currentUserId) {
            pollInterval = setInterval(() => loadMessages(currentUserId, true), 5000);
        }
    } else if (tab === 'agenda') {
        navAgenda.classList.add('active');
        agendaArea.style.display = 'flex';
        
        initCalendar();
        if (calendar) {
            setTimeout(() => {
                calendar.render();
            }, 50);
        }
    } else if (tab === 'metrics') {
        if (currentUserData?.role !== 'ADMIN') return;
        navMetrics.classList.add('active');
        metricsArea.style.display = 'flex';
        loadStats();
    } else if (tab === 'staff') {
        if (currentUserData?.role !== 'ADMIN') return;
        document.getElementById('navStaff').classList.add('active');
        document.getElementById('staffArea').style.display = 'flex';
        loadStaff();
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        document.getElementById('statUsers').textContent = stats.totalUsers || 0;
        document.getElementById('statLeads').textContent = stats.totalLeads || 0;
        document.getElementById('statClients').textContent = stats.totalClients || 0;
        document.getElementById('statAppointments').textContent = stats.totalAppointments || 0;
        document.getElementById('statConversion').textContent = stats.conversionRate || "0%";
        document.getElementById('statIntent').textContent = stats.topIntent || "N/A";
        
        document.getElementById('statDropoffs').textContent = stats.dropoffsCount || 0;
        
        const faqList = document.getElementById('faqList');
        faqList.innerHTML = '';
        if (stats.topFaqs && stats.topFaqs.length > 0) {
            stats.topFaqs.forEach(faq => {
                faqList.innerHTML += `<li><span>${faq.question}</span> <span class="ranking-badge">${faq.count}</span></li>`;
            });
        } else {
            faqList.innerHTML = '<li><span style="color:var(--text-secondary)">No hay datos suficientes</span></li>';
        }

        const dropoffList = document.getElementById('dropoffList');
        dropoffList.innerHTML = '';
        if (stats.dropoffUsersList && stats.dropoffUsersList.length > 0) {
            stats.dropoffUsersList.forEach(u => {
                const displayName = u.name || u.phone;
                dropoffList.innerHTML += `
                <li style="cursor:pointer;" onclick="selectUserById('${u.id}')" title="Ir al chat">
                    <span><i class='bx bx-user'></i> ${displayName}</span>
                    <i class='bx bx-chevron-right' style="color:var(--accent)"></i>
                </li>`;
            });
        } else {
            dropoffList.innerHTML = '<li><span style="color:var(--text-secondary)">No hay abandonos recientes</span></li>';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function selectUserById(id) {
    const user = allUsers.find(u => u.id === id);
    if (user) {
        switchTab('chats');
        selectUser(user);
    }
}

function openAppointmentModal(appointmentJson) {
    const appt = JSON.parse(decodeURIComponent(appointmentJson));
    document.getElementById('modalTitle').textContent = `Turno: ${appt.service}`;
    document.getElementById('modalDescription').innerHTML = `
        <p><strong>Fecha y Hora:</strong> ${new Date(appt.date).toLocaleString()}</p>
        <p><strong>Estado:</strong> ${appt.status}</p>
    `;
    document.getElementById('appointmentModal').style.display = 'flex';
}

function closeModal(id) {
    if (id) {
        document.getElementById(id).style.display = 'none';
    } else {
        document.getElementById('appointmentModal').style.display = 'none';
    }
}

// Phase 3: Broadcast & Summary
function openBroadcastModal() {
    document.getElementById('broadcastModal').style.display = 'flex';
    document.getElementById('broadcastMessage').value = '';
}

async function sendBroadcast() {
    const filter = document.getElementById('broadcastFilter').value;
    const message = document.getElementById('broadcastMessage').value.trim();
    if (!message) {
        alert("Por favor escribe un mensaje.");
        return;
    }
    
    let targets = [];
    if (filter === 'ALL') targets = allUsers.map(u => u.id);
    else targets = allUsers.filter(u => u.status === filter).map(u => u.id);
    
    if (targets.length === 0) {
        alert("No hay usuarios en esta categoría.");
        return;
    }
    
    const btn = document.getElementById('broadcastBtn');
    btn.textContent = 'Enviando...';
    btn.disabled = true;
    
    try {
        const res = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, userIds: targets })
        });
        const data = await res.json();
        alert(`Campaña enviada a ${data.sentCount} contactos.`);
        closeModal('broadcastModal');
        if (currentUserId && targets.includes(currentUserId)) {
            loadMessages(currentUserId, false); // Reload chat if open
        }
    } catch (e) {
        console.error(e);
        alert("Error enviando campaña.");
    } finally {
        btn.textContent = 'Enviar Mensaje';
        btn.disabled = false;
    }
}

async function summarizeCurrentChat() {
    if (!currentUserId) return;
    
    const modal = document.getElementById('summaryModal');
    const desc = document.getElementById('summaryDescription');
    modal.style.display = 'flex';
    desc.innerHTML = '<i class="bx bx-loader-circle bx-spin" style="font-size:2rem; color:var(--accent);"></i><br>Generando resumen con IA...';
    
    try {
        const res = await fetch(`/api/users/${currentUserId}/summary`);
        const data = await res.json();
        desc.innerHTML = data.summary.replace(/\n/g, '<br>');
    } catch (e) {
        console.error(e);
        desc.innerHTML = 'Hubo un error al generar el resumen.';
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
            
            // Format the date forcing UTC so the exact hour requested is shown
            const dateStr = info.event.start.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = info.event.start.toLocaleTimeString('es-AR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
            
            // Render nice formatted description
            descEl.innerHTML = `
                <div style="margin-bottom: 15px; font-size: 1.1rem; color: var(--accent);">
                    <strong><i class='bx bx-time-five'></i> Horario:</strong><br> 
                    <span style="text-transform: capitalize;">${dateStr}</span> a las ${timeStr}
                </div>
                <div>${info.event.extendedProps.description}</div>
            `;
            
            modal.style.display = 'flex';
        }
    });
    
    calendar.render();
}

// Removed duplicate closeModal
// Manual Messaging & Bot Toggle
async function toggleBotStatus() {
    if (!currentUserId) return;
    
    const toggle = document.getElementById('botToggle');
    const isPaused = !toggle.checked;
    const statusText = document.getElementById('botStatusText');
    
    statusText.textContent = isPaused ? 'Pausando...' : 'Activando...';
    
    try {
        const res = await fetch(`/api/users/${currentUserId}/toggle-bot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paused: isPaused })
        });
        const data = await res.json();
        
        if (data.success) {
            statusText.textContent = data.botPaused ? 'Bot Pausado' : 'Bot Activo';
            loadUsers(); // Refresh users list state in background
        }
    } catch (error) {
        console.error('Error toggling bot:', error);
        toggle.checked = !isPaused; // revert
        statusText.textContent = 'Error';
    }
}

async function sendManualMessage() {
    if (!currentUserId) return;
    
    const input = document.getElementById('manualMessageInput');
    const content = input.value.trim();
    if (!content) return;
    
    input.value = '';
    
    try {
        const res = await fetch(`/api/users/${currentUserId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const data = await res.json();
        
        if (data.success) {
            loadMessages(currentUserId, false); // Reload messages instantly
        }
    } catch (error) {
        console.error('Error sending manual message:', error);
    }
}

// Allow Enter key to send message
document.getElementById('manualMessageInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendManualMessage();
    }
});

// Start
init();

// Staff Management
async function loadStaff() {
    try {
        const res = await fetch('/api/auth/users');
        const users = await res.json();
        const grid = document.getElementById('staffGrid');
        grid.innerHTML = '';
        if (users.length === 0) {
            grid.innerHTML = '<div style="color:var(--text-secondary); grid-column: 1 / -1;">No hay usuarios registrados.</div>';
            return;
        }
        users.forEach(u => {
            const roleColor = u.role === 'ADMIN' ? '#ef4444' : u.role === 'DIOS' ? '#a855f7' : u.role === 'EXPERTO' ? '#3b82f6' : '#22c55e';
            const roleBg = u.role === 'ADMIN' ? 'rgba(239, 68, 68, 0.1)' : u.role === 'DIOS' ? 'rgba(168, 85, 247, 0.1)' : u.role === 'EXPERTO' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)';
            const roleDesc = u.role === 'ADMIN' ? 'Acceso Total a todo el sistema.' : u.role === 'DIOS' ? 'Todo excepto Gestión de Personal.' : u.role === 'EXPERTO' ? 'Agenda y Ver Chats.' : 'Solo Gestión de Agenda.';
            const displayName = u.name || 'Sin Nombre';
            const initial = displayName.charAt(0).toUpperCase();
            
            let firstName = '';
            let lastName = '';
            if (u.name) {
                const parts = u.name.split(' ');
                firstName = parts[0];
                lastName = parts.slice(1).join(' ');
            }

            grid.innerHTML += `
                <div class="glass-panel" style="flex: 1 1 250px; max-width: 400px; padding: 20px; display: flex; flex-direction: column; gap: 15px; position: relative;">
                    <div style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
                        <div class="avatar-placeholder" style="margin: 0;">${initial}</div>
                        <span class="status-badge" style="background: ${roleBg}; color: ${roleColor}; margin: 0; cursor: help;" title="${roleDesc}">${u.role}</span>
                    </div>
                    <div>
                        <h3 style="color: var(--text-primary); font-size: 1.1rem; margin-bottom: 5px;">${displayName}</h3>
                        <p style="color: var(--text-secondary); font-size: 0.9rem;"><i class='bx bx-user'></i> @${u.username}</p>
                    </div>
                    <div style="display: flex; gap: 10px; width: 100%; margin-top: auto; border-top: 1px solid var(--border-color); padding-top: 15px;">
                        <button onclick="openEditUserModal('${u.id}', '${u.username}', '${u.role}', '${firstName}', '${lastName}')" class="btn-primary" style="flex: 1; padding: 8px; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 5px;">
                            <i class='bx bx-edit'></i> Editar
                        </button>
                        <button onclick="deleteUser('${u.id}')" class="btn-primary" style="flex: 1; padding: 8px; font-size: 0.9rem; background: linear-gradient(135deg, #ef4444, #b91c1c); display: flex; align-items: center; justify-content: center; gap: 5px;">
                            <i class='bx bx-trash'></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

function openEditUserModal(id, username, role, firstName = '', lastName = '') {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = username;
    document.getElementById('editFirstName').value = firstName;
    document.getElementById('editLastName').value = lastName;
    document.getElementById('editPassword').value = '';
    document.getElementById('editRole').value = role;
    document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
}

async function submitEditUser(e) {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value;
    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const name = `${firstName} ${lastName}`.trim();
    const password = document.getElementById('editPassword').value;
    const role = document.getElementById('editRole').value;
    
    try {
        const body = { username, role, name };
        if (password) body.password = password;
        
        const res = await fetch(`/api/auth/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (data.success) {
            closeEditUserModal();
            loadStaff();
            alert("Usuario actualizado correctamente.");
        } else {
            alert(data.error || "Error al actualizar");
        }
    } catch (err) {
        alert("Error de conexión");
    }
}

async function createUser(e) {
    e.preventDefault();
    const username = document.getElementById('newUsername').value;
    const firstName = document.getElementById('newFirstName').value.trim();
    const lastName = document.getElementById('newLastName').value.trim();
    const name = `${firstName} ${lastName}`.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    
    try {
        const res = await fetch('/api/auth/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, password, role })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('createUserForm').reset();
            loadStaff();
            alert("Empleado creado con éxito");
        } else {
            alert(data.error || "Error al crear");
        }
    } catch (e) {
        alert("Error de conexión");
    }
}

async function deleteUser(id) {
    if (!confirm("¿Seguro que deseas eliminar este usuario?")) return;
    try {
        await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
        loadStaff();
    } catch (e) {
        alert("Error al eliminar");
    }
}
