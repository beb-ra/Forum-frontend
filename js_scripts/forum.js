// ---- подфорумы ----
async function loadSubforums() {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/subforums`, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (!res.ok) {
            showMessage('Не удалось загрузить подфорумы: ' + res.status);
            return;
        }
        const data = await res.json();
        subforums = data
            .filter(s => !s.isDeleted)
            .map(s => ({
                id: s.subforumId ?? s.id,
                name: s.name ?? s.title ?? ('Подфорум ' + (s.subforumId ?? s.id))
            }));
        renderSubforums();
        renderSubforumSelect();
    } catch (e) {
        showMessage('Ошибка загрузки подфорумов: ' + e.message);
    }
}

function renderSubforums() {
    const ul = document.getElementById('subforumsList');
    ul.innerHTML = '';
    ul.appendChild(makeSubforumItem('Все посты', null));

    if (subforums.length === 0) {
        const li = document.createElement('li');
        li.className = 'subforum-item';
        li.style.color = '#999';
        li.textContent = 'Подфорумов нет';
        ul.appendChild(li);
        return;
    }

    subforums.forEach(s => ul.appendChild(makeSubforumItem(s.name, s.id)));
}

function makeSubforumItem(name, id) {
    const li = document.createElement('li');
    li.className = 'subforum-item' + (id === currentSubforumId ? ' active' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'subforum-name';
    nameSpan.textContent = name;
    li.appendChild(nameSpan);

    if (id !== null && isGlobalAdmin()) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'subforum-del-btn';
        delBtn.title = 'Удалить подфорум';
        delBtn.textContent = '×';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            askDeleteSubforum(id, name);
        };
        li.appendChild(delBtn);
    }

    li.onclick = () => {
        currentSubforumId = id;
        renderSubforums();
        renderSubforumSelect();
        renderPosts();
    };
    return li;
}

function renderSubforumSelect() {
    const sel = document.getElementById('postSubforumId');
    if (!sel) return;
    sel.innerHTML = '';

    if (subforums.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = '— нет подфорумов —';
        sel.appendChild(o);
        return;
    }

    subforums.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name;
        sel.appendChild(o);
    });

    if (currentSubforumId !== null) {
        sel.value = String(currentSubforumId);
    }
}

function subforumName(id) {
    const s = subforums.find(x => x.id === id);
    return s ? s.name : ('Подфорум ' + id);
}

async function createSubforum() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (!isGlobalAdmin()) { showMessage('Только администратор может создавать подфорумы'); return; }

    const nameEl = document.getElementById('subforumName');
    const descEl = document.getElementById('subforumDesc');
    const name = nameEl.value.trim();
    const desc = descEl.value.trim();

    if (!name) { showMessage('Введите название подфорума'); return; }

    try {
        const res = await fetch(`${API_URL}/api/subforums`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ name: name, description: desc || null })
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
            showMessage(`Ошибка ${res.status}: ${errText}`);
            return;
        }

        nameEl.value = '';
        descEl.value = '';
        closeCreateSubforumModal();
        showMessage('Подфорум создан!', false);
        await loadSubforums();
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

function askDeleteSubforum(id, name) {
    showConfirm(
        `Вы действительно хотите удалить подфорум «${name}»? Все посты в нём будут удалены.`,
        () => deleteSubforum(id, name),
        'Удаление подфорума',
        'Удалить'
    );
}

async function deleteSubforum(id, name) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (!isGlobalAdmin()) { showMessage('Только администратор может удалять подфорумы'); return; }

    try {
        const postsRes = await fetch(`${API_URL}/api/posts`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!postsRes.ok) {
            showMessage('Не удалось получить список постов: ' + postsRes.status);
            return;
        }
        const allPosts = await postsRes.json();
        const postsToDelete = allPosts.filter(p =>
            p.subforumId === id && !p.isDeleted
        );

        let failed = 0;
        for (const p of postsToDelete) {
            const r = await fetch(`${API_URL}/api/posts/${p.postId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!r.ok) failed++;
        }

        const res = await fetch(`${API_URL}/api/subforums/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            showMessage('Ошибка удаления подфорума: ' + res.status);
            return;
        }

        if (currentSubforumId === id) currentSubforumId = null;

        if (failed > 0) {
            showMessage(`Подфорум удалён, но ${failed} пост(ов) удалить не удалось`);
        } else {
            showMessage(`Подфорум «${name}» удалён`, false);
        }

        await loadSubforums();
        await loadPosts();
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

// ---- теги ----
async function loadTags() {
    try {
        const res = await fetch(`${API_URL}/api/tags`);
        if (!res.ok) return;
        const tags = await res.json();
        tagsCache = {};
        tags.forEach(t => { tagsCache[t.tagId] = t.name; });
    } catch (e) { }
}

async function ensureTagsLoaded() {
    if (tagsLoaded) return;
    await loadTags();
    tagsLoaded = true;
}

function tagName(id) {
    if (id == null) return null;
    return tagsCache[id] || ('Тег ' + id);
}

// ---- пользователи (кэш имён) ----
async function getUsername(userId) {
    if (userId == null) return '—';
    if (usersCache[userId]) return usersCache[userId];
    try {
        const res = await fetch(`${API_URL}/api/users/${userId}`);
        if (res.ok) {
            const u = await res.json();
            usersCache[userId] = u.username;
            return usersCache[userId];
        }
    } catch (e) { }
    usersCache[userId] = 'Пользователь ' + userId;
    return usersCache[userId];
}

async function ensureUsernamesLoaded(ids) {
    const uniq = [...new Set(ids)].filter(id => id != null && !usersCache[id]);
    await Promise.all(uniq.map(id => getUsername(id)));
}

// ---- голоса ----
async function loadVotes() {
    try {
        const res = await fetch(`${API_URL}/api/votes`);
        if (!res.ok) return;
        votes = await res.json();
    } catch (e) { }
}

function getMyVote(type, id) {
    const uid = getCurrentUserId();
    if (uid == null) return 0;
    const vote = votes.find(v => v.userId === uid &&
        (type === 'post' ? v.postId === id : v.commentId === id));
    return vote ? vote.voteType : 0;
}

function computeScore(type, id) {
    let score = 0;
    votes.forEach(v => {
        if (type === 'post' && v.postId === id) score += v.voteType;
        if (type === 'comment' && v.commentId === id) score += v.voteType;
    });
    return score;
}

function updateVoteUI(type, id, score) {
    const myVote = getMyVote(type, id);
    const wrapper = document.querySelector(
        `[data-vote-type="${type}"][data-vote-id="${id}"]`
    );
    if (!wrapper) return;

    const scoreEl = wrapper.querySelector('.vote-score');
    const upBtn = wrapper.querySelector('.vote-btn.up');
    const downBtn = wrapper.querySelector('.vote-btn.down');

    if (scoreEl) {
        scoreEl.textContent = score ?? 0;
        scoreEl.classList.remove('positive', 'negative');
        if (score > 0) scoreEl.classList.add('positive');
        else if (score < 0) scoreEl.classList.add('negative');
    }

    if (upBtn) upBtn.classList.toggle('active-up', myVote === 1);
    if (downBtn) downBtn.classList.toggle('active-down', myVote === -1);
}

function renderVoteControls(type, id, score) {
    const myVote = getMyVote(type, id);
    const upClass = myVote === 1 ? ' active-up' : '';
    const downClass = myVote === -1 ? ' active-down' : '';
    const scoreClass = score > 0 ? ' positive' : (score < 0 ? ' negative' : '');
    const fn = type === 'post' ? 'votePost' : 'voteComment';

    return `<span class="vote-controls" data-vote-type="${type}" data-vote-id="${id}">
        <button class="vote-btn up${upClass}" title="Нравится" onclick="event.stopPropagation(); ${fn}(${id}, 1)">👍</button>
        <span class="vote-score${scoreClass}">${score ?? 0}</span>
        <button class="vote-btn down${downClass}" title="Не нравится" onclick="event.stopPropagation(); ${fn}(${id}, -1)">👎</button>
    </span>`;
}

async function votePost(postId, value) {
    const ok = await voteOnTarget('post', postId, value);
    if (!ok) return;

    const newScore = computeScore('post', postId);

    const p = posts.find(x => x.postId === postId);
    if (p) p.rating = newScore;
    if (currentPost && currentPost.postId === postId) currentPost.rating = newScore;

    updateVoteUI('post', postId, newScore);
}

async function voteComment(commentId, value) {
    const ok = await voteOnTarget('comment', commentId, value);
    if (!ok) return;

    const newScore = computeScore('comment', commentId);

    const c = currentComments.find(x => x.commentId === commentId);
    if (c) c.rating = newScore;

    updateVoteUI('comment', commentId, newScore);
}

async function voteOnTarget(type, id, value) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return false; }

    const uid = getCurrentUserId();
    const existing = votes.find(v => v.userId === uid &&
        (type === 'post' ? v.postId === id : v.commentId === id));

    try {
        if (existing && existing.voteType === value) {
            const res = await fetch(`${API_URL}/api/votes/${existing.voteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) { showMessage('Ошибка отмены голоса: ' + res.status); return false; }
        } else {
            const body = {
                postId: type === 'post' ? id : null,
                commentId: type === 'comment' ? id : null,
                voteType: value
            };
            const res = await fetch(`${API_URL}/api/votes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) { showMessage('Ошибка голосования: ' + res.status); return false; }
        }

        await loadVotes();
        return true;
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
        return false;
    }
}

// ---- посты ----
async function loadPosts() {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/posts`, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (!res.ok) {
            showMessage('Не удалось загрузить посты: ' + res.status);
            return;
        }

        const all = await res.json();
        posts = all.filter(p => !p.isDeleted);

        await ensureUsernamesLoaded(posts.map(p => p.authorId));

        renderPosts();
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

function renderPosts() {
    const container = document.getElementById('postsList');
    const label = document.getElementById('postsFilterLabel');
    container.innerHTML = '';

    label.textContent = currentSubforumId === null
        ? '(все подфорумы)'
        : '(' + subforumName(currentSubforumId) + ')';

    let visible = currentSubforumId === null
        ? posts.slice()
        : posts.filter(p => p.subforumId === currentSubforumId);

    if (visible.length === 0) {
        container.innerHTML = '<p>Постов пока нет.</p>';
        return;
    }

    visible.forEach(p => {
        const div = document.createElement('div');
        div.className = 'post';

        const author = usersCache[p.authorId] || ('Пользователь ' + p.authorId);
        const tag = p.tagId != null ? tagName(p.tagId) : null;

        div.innerHTML = `
            <h3>
                <a class="post-title-link" href="?post=${p.postId}">
                    ${escapeHtml(p.title)}
                </a>
            </h3>
            <p>${escapeHtml(p.content)}</p>
            <div class="post-meta">
                Автор:
                <a class="author-link" href="?profile=${p.authorId}">
                    ${escapeHtml(author)}
                </a>
                ${tag ? ` | Тег: ${escapeHtml(tag)}` : ''}
                ${renderVoteControls('post', p.postId, p.rating ?? 0)}
            </div>
        `;
        container.appendChild(div);
    });
}

async function createPost() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const sel = document.getElementById('postSubforumId');
    const subforumId = parseInt(sel.value, 10);
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;

    if (!subforums.length || !sel.value) {
        showMessage('Нет доступных подфорумов');
        return;
    }
    if (!title || !content) {
        showMessage('Заполните заголовок и текст');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ subforumId, title, content })
        });

        if (!res.ok) {
            const text = await res.text();
            showMessage(`Ошибка ${res.status}: ${text}`);
            return;
        }

        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        showMessage('Пост создан!', false);
        loadPosts();
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

// ---- страница поста ----
async function showPostDetail(postId) {
    showPostDetailSection();
    currentPostId = parseInt(postId, 10);

    const token = getToken();
    const container = document.getElementById('postDetailContent');
    container.innerHTML = '<p>Загрузка...</p>';

    try {
        await loadVotes();

        const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });

        if (!res.ok) {
            container.innerHTML = `<p class="error">Не удалось загрузить пост: ${res.status}</p>`;
            return;
        }

        const p = await res.json();
        currentPost = p;

        if (p.isDeleted) {
            container.innerHTML = `<p class="error">Этот пост был удалён.</p>`;
            document.getElementById('commentFormContainer').style.display = 'none';
            document.getElementById('commentsList').innerHTML = '';
            return;
        }

        const author = await getUsername(p.authorId);
        const subName = p.subforumId != null ? subforumName(p.subforumId) : '—';
        const tag = p.tagId != null ? tagName(p.tagId) : null;

        const currentUserId = getCurrentUserId();
        const isPostAuthor = currentUserId != null && p.authorId === currentUserId;
        const canMod = canModerateSubforum(p.subforumId);
        currentPostCanModerate = canMod;

        const canDeletePost = canMod || isPostAuthor;

        let html = `
            <h2>${escapeHtml(p.title)}</h2>
            <div class="post-meta" style="margin-bottom: 10px;">
                Автор:
                <a class="author-link" href="?profile=${p.authorId}">
                    ${escapeHtml(author)}
                </a>
                |
                Подфорум: ${escapeHtml(subName)} |
                Дата: ${formatDate(p.creationDate)}
                ${tag ? ` | Тег: ${escapeHtml(tag)}` : ''}
                ${renderVoteControls('post', p.postId, p.rating ?? 0)}
            </div>
            <p>${escapeHtml(p.content)}</p>
        `;

        const hasControls = canMod || canDeletePost || isPostAuthor;
        if (hasControls) {
            let panelTitle = 'Управление';
            if (isPostAuthor && !canMod) panelTitle = 'Управление постом';
            else if (canMod && !isPostAuthor) panelTitle = 'Модерация';
            else if (canMod && isPostAuthor) panelTitle = 'Управление и модерация';

            html += `<div class="mod-panel">
                <h3>${panelTitle}</h3>
                <div class="row-buttons">`;

            if (isPostAuthor) {
                html += `<button onclick="startEditPost()">Редактировать</button>`;
            }

            if (canMod && Object.keys(tagsCache).length > 0) {
                const options = Object.entries(tagsCache).map(([id, name]) =>
                    `<option value="${id}" ${String(p.tagId) === String(id) ? 'selected' : ''}>${escapeHtml(name)}</option>`
                ).join('');
                html += `
                    <label for="tagSelect" style="margin:0; align-self:center; font-size:14px; color:#555;">Тег:</label>
                    <select id="tagSelect">
                        ${options}
                    </select>
                    <button onclick="savePostTag()">Сохранить тег</button>
                `;
            }

            if (canDeletePost) {
                html += `<button class="danger" onclick="deleteCurrentPost()">Удалить пост</button>`;
            }

            html += `</div></div>`;
        }

        container.innerHTML = html;

        document.getElementById('commentFormContainer').style.display = token ? 'block' : 'none';

        await loadComments(currentPostId, canMod);
    } catch (e) {
        container.innerHTML = `<p class="error">Ошибка: ${escapeHtml(e.message)}</p>`;
    }
}

function startEditPost() {
    const p = currentPost;
    if (!p) return;

    const container = document.getElementById('postDetailContent');
    container.innerHTML = `
        <h2>Редактирование поста</h2>
        <label style="font-size:14px; color:#555;">Заголовок:</label>
        <input id="editPostTitle" type="text">
        <label style="font-size:14px; color:#555;">Текст:</label>
        <textarea id="editPostContent" rows="6"></textarea>
        <div class="form-actions">
            <button class="success" onclick="saveEditedPost()">Сохранить</button>
            <button class="logout" onclick="showPostDetail(${currentPostId})">Отмена</button>
        </div>
    `;
    document.getElementById('editPostTitle').value = p.title;
    document.getElementById('editPostContent').value = p.content;
}

async function saveEditedPost() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const title = document.getElementById('editPostTitle').value.trim();
    const content = document.getElementById('editPostContent').value.trim();

    if (!title || !content) {
        showMessage('Заполните заголовок и текст');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ ...currentPost, title, content })
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
            showMessage(`Ошибка ${res.status}: ${errText}`);
            return;
        }

        showMessage('Пост обновлён!', false);
        await showPostDetail(currentPostId);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function savePostTag() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const sel = document.getElementById('tagSelect');
    if (!sel) return;
    const newTagId = parseInt(sel.value, 10);
    if (isNaN(newTagId)) {
        showMessage('Выберите тег');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ tagId: newTagId })
        });

        if (!res.ok) {
            const text = await res.text();
            showMessage(`Ошибка ${res.status}: ${text}`);
            return;
        }

        showMessage('Тег обновлён!', false);
        await showPostDetail(currentPostId);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function deleteCurrentPost() {
    if (!confirm('Удалить этот пост?')) return;

    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    try {
        const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            showMessage('Ошибка удаления: ' + res.status);
            return;
        }

        showMessage('Пост удалён', false);
        setTimeout(() => { window.location.href = window.location.pathname; }, 500);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

// комментарии
async function loadComments(postId, canModerate) {
    const list = document.getElementById('commentsList');
    list.innerHTML = '<p>Загрузка комментариев...</p>';

    try {
        const res = await fetch(`${API_URL}/api/comments`);
        if (!res.ok) {
            list.innerHTML = `<p class="error">Не удалось загрузить комментарии: ${res.status}</p>`;
            return;
        }

        const all = await res.json();
        const pid = parseInt(postId, 10);
        const comments = all.filter(c => c.postId === pid);

        const deletedParentsToKeep = new Set();
        comments.forEach(c => {
            if (!c.isDeleted && c.parentCommentId != null) {
                deletedParentsToKeep.add(c.parentCommentId);
            }
        });

        const visibleComments = comments.filter(c =>
            !c.isDeleted || deletedParentsToKeep.has(c.commentId)
        );

        currentComments = visibleComments;

        if (visibleComments.length === 0) {
            list.innerHTML = '<p class="no-comments">Комментариев еще нет</p>';
            return;
        }

        await ensureUsernamesLoaded(
            visibleComments.filter(c => !c.isDeleted).map(c => c.authorId)
        );

        const byId = {};
        visibleComments.forEach(c => { byId[c.commentId] = { ...c, children: [] }; });

        const roots = [];
        visibleComments.forEach(c => {
            const node = byId[c.commentId];
            if (c.parentCommentId != null && byId[c.parentCommentId]) {
                byId[c.parentCommentId].children.push(node);
            } else {
                roots.push(node);
            }
        });

        const currentUserId = getCurrentUserId();
        list.innerHTML = '';

        const renderNode = (node, depth) => {
            const div = document.createElement('div');
            div.id = 'comment-' + node.commentId;
            div.className = 'comment';
            if (depth > 0) div.style.marginLeft = (depth * 24) + 'px';

            if (node.isDeleted) {
                div.classList.add('deleted');
                div.innerHTML = `<div class="comment-meta">Комментарий удален</div>`;
            } else {
                const author = usersCache[node.authorId] || ('Пользователь ' + node.authorId);
                const isAuthor = currentUserId != null && node.authorId === currentUserId;
                const canDelete = canModerate || isAuthor;

                const replyBtn = `<button class="comment-del-btn reply-btn" onclick="startReply(${node.commentId})">Ответить</button>`;
                const editBtn = isAuthor
                    ? `<button class="logout comment-del-btn" onclick="startEditComment(${node.commentId})">Изменить</button>`
                    : '';
                const delBtn = canDelete
                    ? `<button class="danger comment-del-btn" onclick="deleteCommentById(${node.commentId})">Удалить</button>`
                    : '';

                div.innerHTML = `
                    <div class="comment-meta">
                        <a class="author-link" href="?profile=${node.authorId}">
                            <strong>${escapeHtml(author)}</strong>
                        </a>
                        · ${formatDate(node.creationDate)}
                        ${renderVoteControls('comment', node.commentId, node.rating ?? 0)}
                        ${replyBtn}
                        ${editBtn}
                        ${delBtn}
                    </div>
                    <div>${escapeHtml(node.content)}</div>
                    <div id="reply-form-${node.commentId}" class="reply-form" style="display: none;">
                        <textarea id="reply-text-${node.commentId}" rows="2" placeholder="Ваш ответ..."></textarea>
                        <div class="form-actions">
                            <button class="success" onclick="submitReply(${node.commentId})">Отправить</button>
                            <button class="logout" onclick="cancelReply(${node.commentId})">Отмена</button>
                        </div>
                    </div>
                `;
            }

            list.appendChild(div);
            node.children.forEach(child => renderNode(child, depth + 1));
        };

        roots.forEach(root => renderNode(root, 0));
    } catch (e) {
        list.innerHTML = `<p class="error">Ошибка: ${escapeHtml(e.message)}</p>`;
    }
}

function startReply(commentId) {
    document.querySelectorAll('[id^="reply-form-"]').forEach(el => {
        if (el.id !== 'reply-form-' + commentId) el.style.display = 'none';
    });

    const form = document.getElementById('reply-form-' + commentId);
    if (!form) return;
    form.style.display = 'block';
    const ta = document.getElementById('reply-text-' + commentId);
    if (ta) ta.focus();
}

function cancelReply(commentId) {
    const form = document.getElementById('reply-form-' + commentId);
    if (form) form.style.display = 'none';
}

async function submitReply(parentCommentId) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const ta = document.getElementById('reply-text-' + parentCommentId);
    if (!ta) return;
    const content = ta.value.trim();
    if (!content) { showMessage('Введите текст ответа'); return; }

    const pid = Number(currentPostId);
    if (!pid || isNaN(pid)) {
        showMessage('Не удалось определить пост');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                postId: pid,
                content: content,
                parentCommentId: parentCommentId
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
            showMessage(`Ошибка ${res.status}: ${errText}`);
            return;
        }

        showMessage('Ответ добавлен!', false);
        await loadComments(pid, currentPostCanModerate);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

function startEditComment(commentId) {
    const c = currentComments.find(x => x.commentId === commentId);
    if (!c) return;

    const div = document.getElementById('comment-' + commentId);
    if (!div) return;

    const author = usersCache[c.authorId] || 'Пользователь';

    div.innerHTML = `
        <div class="comment-meta">
            <strong>${escapeHtml(author)}</strong> · ${formatDate(c.creationDate)} · редактирование
        </div>
        <textarea id="editCommentText-${commentId}" rows="3"></textarea>
        <div class="form-actions">
            <button class="success" onclick="saveEditedComment(${commentId})">Сохранить</button>
            <button class="logout" onclick="loadComments(${currentPostId}, ${currentPostCanModerate})">Отмена</button>
        </div>
    `;
    document.getElementById('editCommentText-' + commentId).value = c.content;
}

async function saveEditedComment(commentId) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const textarea = document.getElementById('editCommentText-' + commentId);
    if (!textarea) return;
    const content = textarea.value.trim();
    if (!content) { showMessage('Введите текст комментария'); return; }

    const original = currentComments.find(x => x.commentId === commentId);

    try {
        const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(original ? { ...original, content: content } : { content: content })
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
            showMessage(`Ошибка ${res.status}: ${errText}`);
            return;
        }

        showMessage('Комментарий обновлён!', false);
        await loadComments(currentPostId, currentPostCanModerate);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function deleteCommentById(id) {
    if (!confirm('Удалить комментарий?')) return;

    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    try {
        const res = await fetch(`${API_URL}/api/comments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            showMessage('Ошибка удаления: ' + res.status);
            return;
        }

        showMessage('Комментарий удалён', false);
        await loadComments(currentPostId, currentPostCanModerate);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function submitComment() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const contentEl = document.getElementById('newCommentContent');
    const content = contentEl.value.trim();
    if (!content) { showMessage('Введите текст комментария'); return; }

    const pid = Number(currentPostId);
    if (!pid || isNaN(pid)) {
        showMessage('Не удалось определить пост');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                postId: pid,
                content: content,
                parentCommentId: null
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
            showMessage(`Ошибка ${res.status}: ${errText}`);
            return;
        }

        contentEl.value = '';
        showMessage('Комментарий добавлен!', false);
        await loadComments(pid, currentPostCanModerate);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}