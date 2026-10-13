	async function login() {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                if (!res.ok) { showMessage('Ошибка входа: ' + res.status); return; }

                const data = await res.json();
                setToken(data.token);
                localStorage.setItem('username', data.username);
                if (data.userId != null) localStorage.setItem('userId', data.userId);

                document.getElementById('loginEmail').value = '';
                document.getElementById('loginPassword').value = '';

                showMessage('Вход выполнен!', false);
                showApp();
            } catch (e) {
                showMessage('Ошибка: ' + e.message);
            }
        }

        async function register() {
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;

            try {
                const res = await fetch(`${API_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });

                if (!res.ok) { showMessage('Ошибка регистрации: ' + res.status); return; }

                const data = await res.json();
                setToken(data.token);
                localStorage.setItem('username', data.username);
                if (data.userId != null) localStorage.setItem('userId', data.userId);

                document.getElementById('regUsername').value = '';
                document.getElementById('regEmail').value = '';
                document.getElementById('regPassword').value = '';

                showMessage('Регистрация успешна!', false);
                showApp();
            } catch (e) {
                showMessage('Ошибка: ' + e.message);
            }
        }

        function logout() {
            clearToken();
            currentSubforumId = null;
            votes = [];
            showLogin();
            showMessage('Вы вышли', false);
        }