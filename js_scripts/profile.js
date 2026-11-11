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

    content.innerHTML = '';

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
            <div class="profile-header-info" style="display: flex; gap: 15px; align-items: center; margin-bottom: 15px;">
                <img src="${getAvatarUrl(u)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #ddd;">
                <div>
                    <div class="profile-row" style="margin: 0;"><strong>ID:</strong> ${escapeHtml(String(u.userId ?? '—'))}</div>
                    <div class="profile-row" style="margin: 0;"><strong>Имя:</strong> ${escapeHtml(u.username ?? '—')}</div>
                    <div class="profile-row" style="margin: 0;"><strong>Дата регистрации:</strong> ${escapeHtml(formatDate(u.registrationDate) || '—')}</div>
                </div>
            </div>
            ${u.description ? `<div class="profile-row"><strong>О себе:</strong> ${escapeHtml(u.description)}</div>` : ''}
        `;
        if (isOwn) {
    html += `
        <div class="profile-row">
            <strong>Email:</strong> ${escapeHtml(u.email ?? '—')}
            <button class="small-btn" onclick="openEmailModal()">Изменить</button>
        </div>
        <div class="profile-row">
            <strong>Пароль:</strong> ••••••••
            <button class="small-btn" onclick="openPasswordModal()">Изменить</button>
        </div>
    `;
}

        // Посты и комментарии пользователя
        let userPosts = [];
        let userComments = [];

        try {
            const [postsRes, commentsRes] = await Promise.all([
                fetch(`${API_URL}/api/posts/author/${profileId}?pageSize=5`),
                fetch(`${API_URL}/api/comments/author/${profileId}?pageSize=5`)
            ]);

            if (postsRes.ok) {
                const rawData = await postsRes.json();
                userPosts = rawData.items || rawData;
            }

            if (commentsRes.ok) {
                const rawData = await commentsRes.json();
                userComments = rawData.items || rawData;
            }
        } catch (_) { }

        const userBans = await loadUserBans(profileId);

if (userBans.length > 0) {
    const now = new Date();
    
    const activeBans = userBans.filter(b => !b.expiresDate || new Date(b.expiresDate) > now);
    const expiredBans = userBans.filter(b => b.expiresDate && new Date(b.expiresDate) <= now);

    // Вывод активных банов
    if (activeBans.length > 0) {
        html += `<div class="profile-subsection">
            <h3>Активные баны</h3>`;
        activeBans.forEach(b => {
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
                <button class="success" onclick="askUnbanUser(${b.banId})">Снять бан</button>
            </div>`;
        });
        html += `</div>`;
    }

    // Вывод истекших банов
    if (expiredBans.length > 0) {
        html += `<div class="profile-subsection">
            <h3>История банов</h3>`;
        expiredBans.forEach(b => {
            const subName = b.subforumId == null
                ? 'Весь форум'
                : (subforumName(b.subforumId) || ('Подфорум ' + b.subforumId));
            html += `<div class="ban-item" style="opacity: 0.6; border-left-color: #6c757d;">
                <div class="ban-info">
                    <strong>Область:</strong> ${escapeHtml(subName)}
                </div>
                <div class="ban-reason">Причина: ${escapeHtml(b.banReason || '—')}</div>
                <div class="ban-dates">
                    Забанен: ${escapeHtml(formatDate(b.bannedDate))} · Истек: ${escapeHtml(formatDate(b.expiresDate))}
                </div>
            </div>`;
        });
        html += `</div>`;
    }
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
                html += `<li class="profile-list-item">
                    <a class="profile-link" href="?post=${c.postId}">
                        ${escapeHtml(c.postTitle || 'Пост')}
                    </a>
                    <span class="profile-excerpt">${escapeHtml(truncate(c.content, 120))}</span>
                    <span class="profile-date">${escapeHtml(formatDate(c.creationDate))}</span>
                </li>`;
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

	    rolesBtn.style.display = 'inline-block'; 
            rolesBtn.textContent = 'Редактировать профиль';
            rolesBtn.className = 'small-btn';
            rolesBtn.onclick = () => openProfileEditModal(u);
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

// удаление своего аккаунта
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

// роли
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

    const list = document.getElementById('moderatorSubforumsList');
    list.innerHTML = '';

    if (subforums.length === 0) {
        list.innerHTML = '<p class="role-hint">Нет подфорумов</p>';
    } else {
        subforums.forEach(s => {
            const label = document.createElement('label');
            label.className = 'radio-row';
            label.innerHTML = `
                <input type="checkbox" value="${s.id}" />
                <span>${escapeHtml(s.name)}</span>
            `;
            list.appendChild(label);
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
        list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    } else if (moderatorRoles.length > 0) {
        setRoleRadio('moderator');
        const modIds = moderatorRoles.map(mr => String(mr.subforumId));
        list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = modIds.includes(cb.value);
        });
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

async function saveUserRoles(btn) {
  return withBtnLock(btn, async () => {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (!isGlobalAdmin()) { showMessage('Только администратор может менять полномочия'); return; }
    if (currentRolesProfileId == null) return;

    const profileId = currentRolesProfileId;

    const selected = document.querySelector('input[name="roleOption"]:checked');
    if (!selected) { showMessage('Выберите роль'); return; }
    const roleValue = selected.value;

    let selectedSubforumIds = [];
    if (roleValue === 'moderator') {
        const boxes = document.querySelectorAll('#moderatorSubforumsList input[type="checkbox"]:checked');
        selectedSubforumIds = [...boxes].map(cb => parseInt(cb.value, 10)).filter(id => !isNaN(id));

        if (selectedSubforumIds.length === 0) {
            showMessage('Выберите хотя бы один подфорум');
            return;
        }
    }

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

    if (roleValue === 'user') {
        closeRolesModal();
        return;
    }

    await loadRolesList();

    let roleId = null;
    if (roleValue === 'admin') {
        roleId = getRoleIdByName('Admin');
    } else if (roleValue === 'moderator') {
        roleId = getRoleIdByName('Moderator');
    }

    if (roleId == null) {
        showMessage('Не удалось определить роль на сервере');
        return;
    }

    const entriesToCreate = roleValue === 'admin'
        ? [{ subforumId: null }]
        : selectedSubforumIds.map(sid => ({ subforumId: sid }));

    for (const entry of entriesToCreate) {
        try {
            const res = await fetch(`${API_URL}/api/subforumroles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    userId: profileId,
                    subforumId: entry.subforumId,
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
  });
}

// баны
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

async function saveBan(btn) {
  return withBtnLock(btn, async () => {
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
});
}

async function loadUserBans(profileId) {
    const token = getToken();
    if (!token) return [];
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

function askUnbanUser(banId, btn) {
    showConfirm(
        'Вы действительно хотите снять бан?',
        () => {
            executeUnban(banId, btn, async () => {
                const params = new URLSearchParams(window.location.search);
                const pid = parseInt(params.get('profile'), 10);
                if (!isNaN(pid)) await showProfilePage(pid);
            });
        },
        'Снятие бана',
        'Снять'
    );
}

function askUnbanUserFromModal(banId, btn, containerId) {
    showConfirm(
        'Вы действительно хотите снять бан?',
        () => {
            executeUnban(banId, btn, () => {
                loadBansList(containerId);
            });
        },
        'Снятие бана',
        'Снять'
    );
}

async function executeUnban(banId, btn, onSuccess) {
    return withBtnLock(btn, async () => {
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

            if (onSuccess) await onSuccess();
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

// смена почты
function openEmailModal() {
    document.getElementById('newEmailInput').value = '';
    document.getElementById('emailPasswordInput').value = ''; // очищаем поле пароля
    document.getElementById('emailModal').classList.add('open');
    setTimeout(() => document.getElementById('newEmailInput').focus(), 50);
}

function closeEmailModal() {
    document.getElementById('emailModal').classList.remove('open');
}

async function saveEmail(btn) {
  return withBtnLock(btn, async () => {
    const token = getToken();
    if (!token) return;

    const newEmail = document.getElementById('newEmailInput').value.trim();
    const currentPassword = document.getElementById('emailPasswordInput').value;

    if (!newEmail || !currentPassword) {
        showMessage('Заполните новый email и текущий пароль');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
        showMessage('Введите корректный адрес электронной почты');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/users/me/email`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ currentPassword, newEmail })
        });

        if (res.ok) {
            closeEmailModal();
            const currentId = getCurrentUserId();
            await showProfilePage(currentId);
        } else if (res.status === 409) {
            showMessage('Этот email уже занят');
        } else if (res.status === 400) {
            const text = await res.text();
            showMessage(text || 'Неверный пароль');
        } else {
            const text = await res.text();
            showMessage(`Ошибка: ${text || res.status}`);
        }
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
});
}

// смена пароля
function openPasswordModal() {
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('passwordModal').classList.add('open');
    setTimeout(() => document.getElementById('currentPasswordInput').focus(), 50);
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('open');
}

async function savePassword(btn) {
  return withBtnLock(btn, async () => {
    const token = getToken();
    if (!token) return;

    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;

    if (!currentPassword || !newPassword) {
        showMessage('Заполните оба поля');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/users/me/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (res.ok) {
            closePasswordModal();
        } else {
            const text = await res.text();
            showMessage(`Ошибка: ${text || res.status}`);
        }
    } catch (e) {
        showMessage('Ошибка сети: ' + e.message);
    }
});
}

function getAvatarUrl(user) {
    if (user.imageUrl && user.imageUrl.trim() !== '') {
        return user.imageUrl;
    }

    // svg-аватарка
    const defaultSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>`;
    
    return `data:image/svg+xml;utf8,${defaultSvg}`;
}

function openProfileEditModal(user) {
    tempAvatarUrl = user.imageUrl || null;

    document.getElementById('editUsernameInput').value = user.username || '';
    document.getElementById('editAvatarPreview').src = getAvatarUrl(user);
    document.getElementById('editDescriptionInput').value = user.description || '';
    document.getElementById('profileEditModal').classList.add('open');
}

function closeProfileEditModal() {
    document.getElementById('profileEditModal').classList.remove('open');
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const urls = await uploadImages([file]);
        tempAvatarUrl = urls[0];
        document.getElementById('editAvatarPreview').src = tempAvatarUrl;
    } catch (e) {
        showMessage('Ошибка загрузки аватарки: ' + e.message);
    }
    event.target.value = '';
}

async function saveProfileChanges(btn) {
  return withBtnLock(btn, async () => {
    const token = getToken();
    if (!token) return;

    const newUsername = document.getElementById('editUsernameInput').value.trim();
    const currentUsername = localStorage.getItem('username');
    const description = document.getElementById('editDescriptionInput').value.trim();

    if (!newUsername) {
        showMessage('Имя пользователя не может быть пустым');
        return;
    }

    if (newUsername.length > 15) {
        showMessage('Новое имя слишком длинное');
        return;
    }

    try {
	if (newUsername !== currentUsername) {
                const nameRes = await fetch(`${API_URL}/api/users/me/name`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ newName: newUsername })
                });

                if (!nameRes.ok) {
                    showMessage('Ошибка изменения имени: ' + nameRes.status);
                    return;
                }

                localStorage.setItem('username', newUsername);
                document.getElementById('currentUser').textContent = newUsername;
            }

        const res = await fetch(`${API_URL}/api/users/me/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ imageUrl: tempAvatarUrl, description: description })
        });

        if (!res.ok) {
            showMessage('Ошибка сохранения профиля: ' + res.status);
            return;
        }
        closeProfileEditModal();
        
        const currentId = getCurrentUserId();
        await showProfilePage(currentId);
    } catch (e) {
        showMessage('Ошибка сети: ' + e.message);
    }
 });
}