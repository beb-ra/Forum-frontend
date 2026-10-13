// ---- показ профиля ----
async function showProfilePage(profileId) {
    showProfileSection();

    const content = document.getElementById('profileContent');
    const title = document.getElementById('profileTitle');
    const logoutBtn = document.getElementById('logoutBtn');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    const rolesBtn = document.getElementById('rolesBtn');
    const banBtn = document.getElementById('banBtn');
    const token = getToken();

    logoutBtn.style.display = 'none';
    deleteAccountBtn.style.display = 'none';
    deleteAccountBtn.onclick = null;
    rolesBtn.style.display = 'none';
    rolesBtn.onclick = null;
    banBtn.style.display = 'none';
    banBtn.onclick = null;

    if (token == null) {
        title.textContent = 'Профиль';
        content.innerHTML = '<p class="error">Вы не авторизованы. Войдите, чтобы увидеть профиль.</p>';
        return;
    }

    const currentId = getCurrentUserId();
    const isOwn = currentId != null && currentId === profileId;

    title.textContent = isOwn ? 'Мой профиль' : 'Профиль пользователя';

    content.innerHTML = '<p>Загрузка...</p>';

    try {
        const url = isOwn
            ? `${API_URL}/api/users/me`
            : `${API_URL}/api/users/${profileId}`;

        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            content.innerHTML = `<p class="error">Не удалось загрузить профиль: ${res.status}</p>`;
            return;
        }

        const u = await res.json();

        let html = `
            <div class="profile-row"><strong>ID:</strong> ${escapeHtml(String(u.userId ?? '—'))}</div>
            <div class="profile-row"><strong>Имя пользователя:</strong> ${escapeHtml(u.username ?? '—')}</div>
            <div class="profile-row"><strong>Дата регистрации:</strong> ${escapeHtml(formatDate(u.registrationDate) || '—')}</div>
        `;
        if (isOwn) {
            html += `<div class="profile-row"><strong>Email:</strong> ${escapeHtml(u.email ?? '—')}</div>`;
        }

        // Посты и комментарии пользователя
        let userPosts = [];
        let userComments = [];
        let postsById = {};

        try {
            const [postsRes, commentsRes] = await Promise.all([
                fetch(`${API_URL}/api/posts`),
                fetch(`${API_URL}/api/comments`)
            ]);

            if (postsRes.ok) {
                const allPosts = await postsRes.json();
                allPosts.forEach(p => {
                    postsById[p.postId] = {
                        title: p.title,
                        isDeleted: !!p.isDeleted
                    };
                });
                userPosts = allPosts
                    .filter(p => !p.isDeleted && p.authorId === profileId)
                    .sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate))
                    .slice(0, 5);
            }

            if (commentsRes.ok) {
                const allComments = await commentsRes.json();
                userComments = allComments
                    .filter(c => !c.isDeleted && c.authorId === profileId)
                    .sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate))
                    .slice(0, 5);
            }
        } catch (_) { }

        // Блок «Активные баны» (для админа)
        const userBans = await loadUserBans(profileId);
        if (isGlobalAdmin() && userBans.length > 0) {
            html += `<div class="profile-subsection">
                <h3>Активные баны</h3>`;
            userBans.forEach(b => {
                const subName = b.subforumId == null
                    ? 'Весь форум'
                    : (subforumName(b.subforumId) || ('Подфорум ' + b.subforumId));
                const expires = b.expiresDate
                    ? formatDate(b.expiresDate)
                    : 'бессрочно';
                html += `<div class="ban-item">
                    <div class="ban-info">
                        <strong>Область:</strong> ${escapeHtml(subName)}
                    </div>
                    <div class="ban-reason">Причина: ${escapeHtml(b.banReason || '—')}</div>
                    <div class="ban-dates">
                        Забанен: ${escapeHtml(formatDate(b.bannedDate))} · До: ${escapeHtml(expires)}
                    </div>
                    <button class="success" onclick="unbanUser(${b.banId})">Снять бан</button>
                </div>`;
            });
            html += `</div>`;
        }

        html += `<div class="profile-subsection">
            <h3>Недавние посты</h3>`;

        if (userPosts.length === 0) {
            html += `<p class="profile-empty">Постов пока нет.</p>`;
        } else {
            html += `<ul class="profile-list">`;
            userPosts.forEach(p => {
                html += `<li class="profile-list-item">
                    <a class="profile-link" href="?post=${p.postId}">
                        ${escapeHtml(p.title)}
                    </a>
                    <span class="profile-excerpt">${escapeHtml(truncate(p.content, 120))}</span>
                    <span class="profile-date">${escapeHtml(formatDate(p.creationDate))}</span>
                </li>`;
            });
            html += `</ul>`;
        }

        html += `</div>`;

        html += `<div class="profile-subsection">
            <h3>Недавние комментарии</h3>`;

        if (userComments.length === 0) {
            html += `<p class="profile-empty">Комментариев пока нет.</p>`;
        } else {
            html += `<ul class="profile-list">`;
            userComments.forEach(c => {
                const postInfo = postsById[c.postId];
                const postTitle = postInfo ? postInfo.title : 'Пост';
                const postDeleted = postInfo ? postInfo.isDeleted : true;

                if (postDeleted) {
                    html += `<li class="profile-list-item">
                        <span class="profile-link" style="color:#888; cursor:default;">
                            ${escapeHtml(postTitle)} (удалён)
                        </span>
                        <span class="profile-excerpt">${escapeHtml(truncate(c.content, 120))}</span>
                        <span class="profile-date">${escapeHtml(formatDate(c.creationDate))}</span>
                    </li>`;
                } else {
                    html += `<li class="profile-list-item">
                        <a class="profile-link" href="?post=${c.postId}">
                            ${escapeHtml(postTitle)}
                        </a>
                        <span class="profile-excerpt">${escapeHtml(truncate(c.content, 120))}</span>
                        <span class="profile-date">${escapeHtml(formatDate(c.creationDate))}</span>
                    </li>`;
                }
            });
            html += `</ul>`;
        }

        html += `</div>`;

        content.innerHTML = html;

        // Кнопки в шапке профиля
        if (isOwn) {
            logoutBtn.style.display = 'inline-block';
            deleteAccountBtn.style.display = 'inline-block';
            deleteAccountBtn.onclick = askDeleteOwnAccount;
        } else {
            if (isGlobalAdmin()) {
                rolesBtn.style.display = 'inline-block';
                rolesBtn.onclick = () => openRolesModal(profileId, u.username || '');
            }
            if (canCurrentUserBan()) {
                banBtn.style.display = 'inline-block';
                banBtn.onclick = () => openBanModal(profileId, u.username || '');
            }
        }
    } catch (e) {
        content.innerHTML = `<p class="error">Ошибка: ${escapeHtml(e.message)}</p>`;
    }
}

// ---- удаление своего аккаунта ----
function askDeleteOwnAccount() {
    const uid = getCurrentUserId();
    if (uid == null) { showMessage('Вы не авторизованы'); return; }

    showConfirm(
        'Вы действительно хотите удалить свой аккаунт? Это действие нельзя отменить.',
        () => deleteOwnAccount(uid),
        'Удаление аккаунта',
        'Удалить'
    );
}

async function deleteOwnAccount(uid) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    try {
        const res = await fetch(`${API_URL}/api/users/${uid}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            let errText = '';
            try { errText = await res.text(); } catch (_) { }
            showMessage(`Ошибка удаления аккаунта: ${res.status} ${errText}`);
            return;
        }

        clearToken();
        currentSubforumId = null;
        votes = [];

        showMessage('Аккаунт удалён', false);
        setTimeout(() => {
            window.location.href = window.location.pathname;
        }, 800);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

// ---- роли ----
async function loadRolesList() {
    if (rolesList.length > 0) return;
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}/api/roles`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) return;
        rolesList = await res.json();
    } catch (e) { }
}

function getRoleIdByName(name) {
    const r = rolesList.find(r => (r.roleName || '').toLowerCase() === name.toLowerCase());
    return r ? r.roleId : null;
}

async function openRolesModal(profileId, username) {
    if (!isGlobalAdmin()) {
        showMessage('Только администратор может изменять полномочия');
        return;
    }

    currentRolesProfileId = profileId;

    document.getElementById('rolesUserName').textContent = username || ('ID ' + profileId);

    const subSel = document.getElementById('roleSubforumId');
    subSel.innerHTML = '';
    if (subforums.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '— нет подфорумов —';
        subSel.appendChild(o);
    } else {
        subforums.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.name;
            subSel.appendChild(o);
        });
    }

    document.getElementById('rolesModal').classList.add('open');
    document.getElementById('moderatorSubforumBlock').style.display = 'none';
    document.getElementById('rolesCurrentInfo').textContent = 'Текущие полномочия: загрузка...';

    setRoleRadio('user');

    await loadRolesList();

    let userRoles = [];
    try {
        const token = getToken();
        const res = await fetch(`${API_URL}/api/subforumroles`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
            const all = await res.json();
            userRoles = all.filter(r => r.userId === profileId);
        }
    } catch (e) { }

    const adminRoleId = getRoleIdByName('Admin');
    const moderatorRoleId = getRoleIdByName('Moderator');

    const hasAdmin = userRoles.some(r => r.roleId === adminRoleId && r.subforumId == null);
    const moderatorRoles = userRoles.filter(r => r.roleId === moderatorRoleId && r.subforumId != null);

    const labels = [];
    if (hasAdmin) labels.push('Администратор');
    moderatorRoles.forEach(mr => {
        const s = subforums.find(x => x.id === mr.subforumId);
        labels.push('Модератор: ' + (s ? s.name : ('#' + mr.subforumId)));
    });
    if (labels.length === 0) labels.push('Обычный пользователь');

    document.getElementById('rolesCurrentInfo').innerHTML =
        'Текущие полномочия: <strong>' + escapeHtml(labels.join(', ')) + '</strong>';

    if (hasAdmin) {
        setRoleRadio('admin');
    } else if (moderatorRoles.length > 0) {
        setRoleRadio('moderator');
        const firstSubId = moderatorRoles[0].subforumId;
        if (subforums.some(s => s.id === firstSubId)) {
            subSel.value = String(firstSubId);
        }
        document.getElementById('moderatorSubforumBlock').style.display = 'block';
    } else {
        setRoleRadio('user');
    }
}

function setRoleRadio(value) {
    document.querySelectorAll('input[name="roleOption"]').forEach(r => {
        r.checked = (r.value === value);
    });
}

function closeRolesModal() {
    document.getElementById('rolesModal').classList.remove('open');
    currentRolesProfileId = null;
}

// слушатель переключения ролей
document.querySelectorAll('input[name="roleOption"]').forEach(r => {
    r.addEventListener('change', () => {
        const block = document.getElementById('moderatorSubforumBlock');
        block.style.display = (r.value === 'moderator') ? 'block' : 'none';
    });
});

async function saveUserRoles() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (!isGlobalAdmin()) { showMessage('Только администратор может менять полномочия'); return; }
    if (currentRolesProfileId == null) return;

    const profileId = currentRolesProfileId;

    const selected = document.querySelector('input[name="roleOption"]:checked');
    if (!selected) { showMessage('Выберите роль'); return; }
    const roleValue = selected.value;

    let existingRoles = [];
    try {
        const res = await fetch(`${API_URL}/api/subforumroles`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
            const all = await res.json();
            existingRoles = all.filter(r => r.userId === profileId);
        }
    } catch (e) { }

    for (const r of existingRoles) {
        try {
            await fetch(`${API_URL}/api/subforumroles/${r.subfRoleId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
        } catch (e) { }
    }

    if (roleValue !== 'user') {
        await loadRolesList();

        let roleId = null;
        let subforumId = null;

        if (roleValue === 'admin') {
            roleId = getRoleIdByName('Admin');
        } else if (roleValue === 'moderator') {
            roleId = getRoleIdByName('Moderator');
            const subSel = document.getElementById('roleSubforumId');
            subforumId = parseInt(subSel.value, 10);
            if (!subforumId || isNaN(subforumId)) {
                showMessage('Выберите подфорум для модератора');
                return;
            }
        }

        if (roleId == null) {
            showMessage('Не удалось определить роль на сервере');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/subforumroles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    userId: profileId,
                    subforumId: subforumId,
                    roleId: roleId
                })
            });

            if (!res.ok) {
                let errText = '';
                try { errText = await res.text(); } catch (_) { }
                showMessage(`Ошибка назначения роли: ${res.status} ${errText}`);
                return;
            }
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
            return;
        }
    }

    closeRolesModal();
    showMessage('Полномочия обновлены', false);
}

// ---- баны ----
function canCurrentUserBan() {
    if (isGlobalAdmin()) return true;
    return getModeratedSubforumIds().length > 0;
}

function openBanModal(profileId, username) {
    if (!canCurrentUserBan()) {
        showMessage('У вас нет прав на бан');
        return;
    }

    currentBanProfileId = profileId;

    document.getElementById('banUserName').textContent = username || ('ID ' + profileId);
    document.getElementById('banReason').value = '';
    document.getElementById('banDuration').value = '';
    document.getElementById('banDeleteAccount').checked = false;
    document.getElementById('banDeleteContent').checked = false;

    const isAdmin = isGlobalAdmin();
    const moderated = getModeratedSubforumIds();

    const globalRow = document.getElementById('banScopeGlobal').closest('label');
    globalRow.style.display = isAdmin ? 'flex' : 'none';

    const subSel = document.getElementById('banSubforumId');
    subSel.innerHTML = '';

    const available = isAdmin
        ? subforums.slice()
        : subforums.filter(s => moderated.includes(s.id));

    if (available.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '— нет доступных подфорумов —';
        subSel.appendChild(o);
    } else {
        available.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.name;
            subSel.appendChild(o);
        });
    }

    if (isAdmin) {
        document.getElementById('banScopeGlobal').checked = true;
        document.getElementById('banSubforumBlock').style.display = 'none';
    } else {
        document.getElementById('banScopeSubforum').checked = true;
        document.getElementById('banSubforumBlock').style.display = 'block';
    }

    document.getElementById('banModal').classList.add('open');
}

function closeBanModal() {
    document.getElementById('banModal').classList.remove('open');
    currentBanProfileId = null;
}

// слушатель переключения области бана
document.querySelectorAll('input[name="banScope"]').forEach(r => {
    r.addEventListener('change', () => {
        const block = document.getElementById('banSubforumBlock');
        block.style.display = (r.value === 'subforum') ? 'block' : 'none';
    });
});

async function deleteUserContent(userId) {
    const token = getToken();
    if (!token) return { postsFailed: 0, commentsFailed: 0 };

    let postsFailed = 0;
    let commentsFailed = 0;

    try {
        const res = await fetch(`${API_URL}/api/posts`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
            const all = await res.json();
            const userPosts = all.filter(p => p.authorId === userId && !p.isDeleted);
            for (const p of userPosts) {
                const r = await fetch(`${API_URL}/api/posts/${p.postId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!r.ok) postsFailed++;
            }
        }
    } catch (e) { }

    try {
        const res = await fetch(`${API_URL}/api/comments`);
        if (res.ok) {
            const all = await res.json();
            const userComments = all.filter(c => c.authorId === userId && !c.isDeleted);
            for (const c of userComments) {
                const r = await fetch(`${API_URL}/api/comments/${c.commentId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!r.ok) commentsFailed++;
            }
        }
    } catch (e) { }

    return { postsFailed, commentsFailed };
}

async function saveBan() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (currentBanProfileId == null) return;

    const reason = document.getElementById('banReason').value.trim();
    if (!reason) { showMessage('Укажите причину бана'); return; }

    const durationDays = document.getElementById('banDuration').value;
    let expiresDate = null;
    if (durationDays) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(durationDays, 10));
        expiresDate = d.toISOString();
    }

    const scope = document.querySelector('input[name="banScope"]:checked').value;

    let subforumId = null;
    if (scope === 'subforum') {
        subforumId = parseInt(document.getElementById('banSubforumId').value, 10);
        if (!subforumId || isNaN(subforumId)) {
            showMessage('Выберите подфорум');
            return;
        }
    }

    const banAndDeleteContent = document.getElementById('banDeleteContent').checked;
    const banAndDeleteAccount = document.getElementById('banDeleteAccount').checked;

    const banUserId = currentBanProfileId;

    try {
        const res = await fetch(`${API_URL}/api/bans`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                userId: banUserId,
                subforumId: subforumId,
                banReason: reason,
                expiresDate: expiresDate
            })
        });

        if (!res.ok) {
            let errText = '';
            try {
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const j = await res.json();
                    errText = j.title || j.detail || JSON.stringify(j);
                    if (j.errors) errText += ' ' + JSON.stringify(j.errors);
                } else {
                    errText = await res.text();
                }
            } catch (_) { }
            showMessage(`Ошибка бана: ${res.status} ${errText}`);
            return;
        }

        let contentErrors = null;
        if (banAndDeleteContent) {
            contentErrors = await deleteUserContent(banUserId);
        }

        let accountDeleted = false;
        if (banAndDeleteAccount) {
            try {
                const delRes = await fetch(`${API_URL}/api/users/${banUserId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (delRes.ok) {
                    accountDeleted = true;
                } else {
                    showMessage('Пользователь забанен, но аккаунт удалить не удалось: ' + delRes.status);
                }
            } catch (e) {
                showMessage('Пользователь забанен, но аккаунт удалить не удалось: ' + e.message);
            }
        }

        closeBanModal();

        const parts = ['Пользователь забанен'];
        if (banAndDeleteContent && contentErrors) {
            if (contentErrors.postsFailed === 0 && contentErrors.commentsFailed === 0) {
                parts.push('контент удалён');
            } else {
                parts.push(`контент частично удалён (постов: -${contentErrors.postsFailed}, комментариев: -${contentErrors.commentsFailed})`);
            }
        }
        if (accountDeleted) parts.push('аккаунт удалён');

        showMessage(parts.join(', '), false);

        const params = new URLSearchParams(window.location.search);
        const pid = parseInt(params.get('profile'), 10);

        if (pid === banUserId) {
            if (accountDeleted) {
                setTimeout(() => { window.location.href = window.location.pathname; }, 600);
            } else {
                setTimeout(() => { showProfilePage(banUserId); }, 600);
            }
        }
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function loadUserBans(profileId) {
    const token = getToken();
    if (!token || !isGlobalAdmin()) return [];
    try {
        const res = await fetch(`${API_URL}/api/bans`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) return [];
        const all = await res.json();
        return all.filter(b => b.userId === profileId);
    } catch (e) {
        return [];
    }
}

async function unbanUser(banId) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    try {
        const res = await fetch(`${API_URL}/api/bans/${banId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            showMessage('Ошибка снятия бана: ' + res.status);
            return;
        }

        showMessage('Бан снят', false);
        const params = new URLSearchParams(window.location.search);
        const pid = parseInt(params.get('profile'), 10);
        if (!isNaN(pid)) await showProfilePage(pid);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}