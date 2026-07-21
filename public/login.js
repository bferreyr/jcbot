document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('submitBtn');
    const errorMsg = document.getElementById('errorMessage');
    
    btn.disabled = true;
    btn.innerHTML = 'Verificando... <i class="bx bx-loader bx-spin"></i>';
    errorMsg.style.display = 'none';
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (data.success) {
            window.location.href = '/index.html';
        } else {
            errorMsg.textContent = data.error || 'Credenciales incorrectas.';
            errorMsg.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = 'Ingresar <i class="bx bx-log-in-circle"></i>';
        }
    } catch (err) {
        errorMsg.textContent = 'Error de conexión con el servidor.';
        errorMsg.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Ingresar <i class="bx bx-log-in-circle"></i>';
    }
});
