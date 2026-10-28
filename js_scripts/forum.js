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

    li.onclick = () => {
        currentSubforumId = id;
        currentPostsPage = 1;
	updateNavUI();
        renderSubforums();
        renderSubforumSelect();
        loadPosts();

	const params = new URLSearchParams();
        if (isShowingMyPosts) params.set('my-posts', '1');
        if (id !== null) params.set('subforum', id);
        
        const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
        window.history.pushState({}, '', newUrl);
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

    const nameEl = document.getElementById('newSubforumName');
    const name = nameEl.value.trim();

    if (!name) { showMessage('Введите название подфорума'); return; }

    try {
        const res = await fetch(`${API_URL}/api/subforums`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ name: name, description: null })
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
        await loadSubforums();
        await loadAdminSubforums();
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
        const postsRes = await fetch(`${API_URL}/api/posts?page=1&pageSize=10000`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!postsRes.ok) {
            showMessage('Не удалось получить список постов: ' + postsRes.status);
            return;
        }
        const data = await postsRes.json();
        const allPosts = data.items || [];

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
            showMessage(`Подфорум удален, но ${failed} пост(ов) удалить не удалось`);
        }

        await loadSubforums();
        await loadPosts();
        await loadAdminSubforums();
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

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

    const c = currentCommentsList.find(x => x.commentId === commentId);
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

async function loadPosts() {
    const token = getToken();
    try {
        let url = '';
        const uid = getCurrentUserId();

        if (isShowingMyPosts && uid) {
            url = `${API_URL}/api/posts/author/${uid}?page=${currentPostsPage}&pageSize=${postsPerPage}`;
        } else {
            url = `${API_URL}/api/posts?page=${currentPostsPage}&pageSize=${postsPerPage}`;
        }

	if (currentSubforumId !== null) url += `&subforumId=${currentSubforumId}`;

	if (currentSearchQuery) {
            url += `&search=${encodeURIComponent(currentSearchQuery)}`;
        }

        const res = await fetch(url, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (!res.ok) {
            showMessage('Не удалось загрузить посты: ' + res.status);
            return;
        }

        const data = await res.json();
        posts = data.items; 
        totalPostsPages = Math.ceil(data.totalCount / postsPerPage) || 1;

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

    let labelText = '';
    if (currentSearchQuery) {
        labelText = `(поиск: "${currentSearchQuery}")`;
    } else if (isShowingMyPosts) {
        labelText = currentSubforumId === null 
            ? '(мои посты)' 
            : `(мои посты в подфоруме: ${subforumName(currentSubforumId)})`;
    } else {
        labelText = currentSubforumId === null 
            ? '(все подфорумы)' 
            : `(${subforumName(currentSubforumId)})`;
    }
    label.textContent = labelText;

    if (posts.length === 0) {
        container.innerHTML = '<p>Постов пока нет.</p>';
        return;
    }

    posts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'post' + (p.isPinned ? ' pinned' : '');

        const author = usersCache[p.authorId] || ('Пользователь ' + p.authorId);
        const tag = p.tagId != null ? tagName(p.tagId) : null;

	const imagesHtml = (p.images && p.images.length > 0)
    ? `<div class="post-images-container">${p.images.map(img => `<img src="${img.imageUrl}" class="post-image">`).join('')}</div>`
    : '';
        div.innerHTML = `
            <h3>
                ${p.isPinned ? '<span class="badge-pin" title="Закреплено">📌</span>' : ''}
                ${p.isClosed ? '<span class="badge-closed" title="Закрыто">🔒</span>' : ''}
                <a class="post-title-link" href="?post=${p.postId}">
                    ${escapeHtml(p.title)}
                </a>
            </h3>
            <p>${escapeHtml(p.content)}</p>
            ${imagesHtml}
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

    // отрисовка кнопок пагинации
    if (totalPostsPages > 1) {
        const pag = document.createElement('div');
        pag.className = 'pagination';
        pag.innerHTML = `
            <button ${currentPostsPage === 1 ? 'disabled' : ''} onclick="changePostsPage(-1)">← Назад</button>
            <span>Страница ${currentPostsPage} из ${totalPostsPages}</span>
            <button ${currentPostsPage === totalPostsPages ? 'disabled' : ''} onclick="changePostsPage(1)">Вперед →</button>
        `;
        container.appendChild(pag);
    }
}

function changePostsPage(delta) {
    currentPostsPage += delta;
    loadPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
            body: JSON.stringify({ subforumId, title, content, imageUrls: currentPostImages })
        });

        if (!res.ok) {
            const text = await res.text();
            showMessage(`Ошибка ${res.status}: ${text}`);
            return;
        }
        document.getElementById('postTitle').value = '';
        document.getElementById('postContent').value = '';
        
        const previewContainer = document.getElementById('postImagesPreview');
        if (previewContainer) {
            previewContainer.innerHTML = '';
        }
        
        currentPostImages = [];
        currentPostsPage = 1;
        loadPosts();
        
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

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
            container.innerHTML = `<p class="error">Этот пост был удален.</p>`;
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

	const imagesHtml = (p.images && p.images.length > 0)
            ? `<div class="post-images-container">${p.images.map(img => `<img src="${img.imageUrl}" class="post-image">`).join('')}</div>`
            : '';

        let html = `
            <h2>${escapeHtml(p.title)}</h2>
            <div class="post-meta" style="margin-bottom: 10px;">
                ${p.isPinned ? '<span class="badge-pin" title="Закреплено">📌 Закреплено</span>' : ''}
                ${p.isClosed ? '<span class="badge-closed" title="Закрыто">🔒 Закрыто</span>' : ''}
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
            ${imagesHtml}
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

            if (canMod) {
                html += `<button class="pin-toggle${p.isPinned ? ' active' : ''}"
                                 title="${p.isPinned ? 'Открепить' : 'Закрепить'}"
                                 onclick="togglePostPinned()">📌</button>`;

                html += `<button class="close-toggle${p.isClosed ? ' active' : ''}"
                                 title="${p.isClosed ? 'Открыть пост' : 'Закрыть пост'}"
                                 onclick="togglePostClosed()">${p.isClosed ? '🔒' : '🔓'}</button>`;
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

        document.getElementById('commentFormContainer').style.display =
            (token && !p.isClosed) ? 'block' : 'none';

        currentCommentsPage = 1;
        currentCommentsList = [];
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

        setTimeout(() => { window.location.href = window.location.pathname; }, 500);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

// генерация HTML одного комментария
function createCommentElement(node, isReply = false) {
    const wrapper = document.createElement('div');
    wrapper.id = 'comment-wrapper-' + node.commentId;

    const div = document.createElement('div');
    div.id = 'comment-' + node.commentId;
    div.className = 'comment' + (node.isPinned ? ' pinned' : '');

    if (node.isDeleted) {
        div.classList.add('deleted');
        div.innerHTML = `<div class="comment-meta">Комментарий удален</div>`;
        wrapper.appendChild(div);
        return wrapper;
    }

    const currentUserId = getCurrentUserId();
    const author = usersCache[node.authorId] || ('Пользователь ' + node.authorId);
    const isAuthor = currentUserId != null && node.authorId === currentUserId;
    const canDelete = currentCommentsCanModerate || isAuthor;

    const postAuthorId = currentPost ? currentPost.authorId : null;
    const isPostAuthorUser = currentUserId != null && currentUserId === postAuthorId;
    const pinBtn = (isPostAuthorUser && !isReply)
        ? `<button class="pin-btn${node.isPinned ? ' active' : ''}"
                 title="${node.isPinned ? 'Открепить' : 'Закрепить'}"
                 onclick="toggleCommentPinned(${node.commentId})">📌</button>`
        : '';

    const replyBtn = `<button class="comment-del-btn reply-btn" onclick="startReply(${node.commentId})">Ответить</button>`;
    const editBtn = isAuthor
        ? `<button class="logout comment-del-btn" onclick="startEditComment(${node.commentId})">Изменить</button>`
        : '';
    const delBtn = canDelete
        ? `<button class="danger comment-del-btn" onclick="deleteCommentById(${node.commentId})">Удалить</button>`
        : '';
    const commentImageHtml = node.imageUrl 
    ? `<img src="${node.imageUrl}" class="comment-image">` 
    : '';
    div.innerHTML = `
        <div class="comment-meta">
            <a class="author-link" href="?profile=${node.authorId}">
                <strong>${escapeHtml(author)}</strong>
            </a>
            · ${formatDate(node.creationDate)}
            ${renderVoteControls('comment', node.commentId, node.rating ?? 0)}
            ${pinBtn}
            ${replyBtn}
            ${editBtn}
            ${delBtn}
        </div>
        <div>${escapeHtml(node.content)}</div>
        ${commentImageHtml}
        <div id="reply-form-${node.commentId}" class="reply-form" style="display: none;">
            <textarea id="reply-text-${node.commentId}" rows="2" placeholder="Ваш ответ..."></textarea>
            <div class="form-actions">
                <button class="success" onclick="submitReply(${node.commentId})">Отправить</button>
                <button class="logout" onclick="cancelReply(${node.commentId})">Отмена</button>
            </div>
        </div>
    `;
    wrapper.appendChild(div);

    if (node.hasReplies) {
        const container = document.createElement('div');
        container.style.marginLeft = '24px';
        container.id = 'replies-container-' + node.commentId;
        
        const btn = document.createElement('button');
        btn.className = 'show-replies-btn';
        btn.textContent = 'Показать ответы';
        btn.onclick = () => loadReplies(node.commentId, btn, container);
        
        wrapper.appendChild(btn);
        wrapper.appendChild(container);
    }
    return wrapper;
}

async function loadComments(postId, canModerate, isLoadMore = false) {
    currentCommentsCanModerate = canModerate;
    const list = document.getElementById('commentsList');

    if (!isLoadMore) {
        currentCommentsPage = 1;
        currentCommentsList = [];
        list.innerHTML = '';

        if (currentPost && currentPost.isClosed) {
            const note = document.createElement('div');
            note.className = 'closed-note';
            note.textContent = 'Пост закрыт. Новые комментарии недоступны.';
            list.appendChild(note);
        }
    }

    try {
        const res = await fetch(`${API_URL}/api/comments?postId=${postId}&page=${currentCommentsPage}&pageSize=${commentsPerPage}`);
        if (!res.ok) throw new Error('Ошибка сервера');

        const data = await res.json();
        totalCommentsPages = Math.ceil(data.totalCount / commentsPerPage) || 1;

        const newItems = data.items;
        currentCommentsList = currentCommentsList.concat(newItems);
        
        await ensureUsernamesLoaded(newItems.map(c => c.authorId));

        if (isLoadMore) {
            const oldBtn = list.querySelector('.load-more-btn');
            if (oldBtn) oldBtn.remove();
        }

        newItems.forEach(node => {
            list.appendChild(createCommentElement(node));
        });

        if (currentCommentsPage < totalCommentsPages) {
            const btn = document.createElement('button');
            btn.className = 'load-more-btn';
            btn.textContent = 'Показать ещё комментарии';
            btn.onclick = () => {
                currentCommentsPage++;
                loadComments(currentPostId, currentCommentsCanModerate, true);
            };
            list.appendChild(btn);
        }

    } catch (e) {
        if (!isLoadMore) {
            list.innerHTML = `<p class="error">Ошибка: ${escapeHtml(e.message)}</p>`;
        } else {
            showMessage('Ошибка загрузки: ' + e.message);
        }
    }
}

async function loadReplies(commentId, btnElement, containerElement) {
    btnElement.style.display = 'none';
    containerElement.innerHTML = '<p style="color:#888; font-size:12px;">Загрузка ответов...</p>';

    try {
        const res = await fetch(`${API_URL}/api/comments?postId=${currentPostId}&parentCommentId=${commentId}`);
        if (!res.ok) throw new Error('Ошибка при загрузке ответов');
        
        const data = await res.json();
        console.log("Полученные ответы:", data.items);
        containerElement.innerHTML = '';

        if (data.items.length === 0) {
            containerElement.innerHTML = '<p style="color:#888; font-size:12px;">Ответов нет.</p>';
            return;
        }
        await ensureUsernamesLoaded(data.items.map(c => c.authorId));
        data.items.forEach(reply => {
            containerElement.appendChild(createCommentElement(reply, true));
        });
    } catch (e) {
        containerElement.innerHTML = `<p class="error" style="font-size:12px;">Ошибка: ${escapeHtml(e.message)}</p>`;
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
        await loadComments(pid, currentCommentsCanModerate, false);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

function startEditComment(commentId) {
    const c = currentCommentsList.find(x => x.commentId === commentId);
    const div = document.getElementById('comment-' + commentId);
    if (!div) return;

    const content = div.querySelector('div:nth-child(2)') ? div.querySelector('div:nth-child(2)').innerText : '';

    div.innerHTML = `
        <div class="comment-meta">
            <strong>${escapeHtml(usersCache[c?.authorId] || 'Пользователь')}</strong> · редактирование
        </div>
        <textarea id="editCommentText-${commentId}" rows="3">${escapeHtml(content)}</textarea>
        <div class="form-actions">
            <button class="success" onclick="saveEditedComment(${commentId})">Сохранить</button>
            <button class="logout" onclick="loadComments(${currentPostId}, ${currentCommentsCanModerate})">Отмена</button>
        </div>
    `;
}

async function saveEditedComment(commentId) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const textarea = document.getElementById('editCommentText-' + commentId);
    if (!textarea) return;
    const content = textarea.value.trim();
    if (!content) { showMessage('Введите текст комментария'); return; }

    try {
        const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ content: content })
        });

        if (!res.ok) {
            let errText = '';
            try { errText = await res.text(); } catch (_) { }
            showMessage(`Ошибка ${res.status}: ${errText}`);
            return;
        }

        await loadComments(currentPostId, currentCommentsCanModerate, false);
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

        await loadComments(currentPostId, currentCommentsCanModerate, false);
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
                parentCommentId: null,
		imageUrl: currentCommentImage
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
	currentCommentImage = null;
	const cPreview = document.getElementById('commentImagePreview');
	if (cPreview) cPreview.innerHTML = '';
        await loadComments(pid, currentCommentsCanModerate, false);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

// закрепление / закрытие
async function togglePostPinned() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (!currentPost) return;

    const newValue = !currentPost.isPinned;

    try {
        const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ ...currentPost, isPinned: newValue })
        });

        if (!res.ok) {
            showMessage('Ошибка закрепления: ' + res.status);
            return;
        }

        currentPost.isPinned = newValue;
        await showPostDetail(currentPostId);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function togglePostClosed() {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }
    if (!currentPost) return;

    const newValue = !currentPost.isClosed;

    try {
        const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ ...currentPost, isClosed: newValue })
        });

        if (!res.ok) {
            showMessage('Ошибка: ' + res.status);
            return;
        }

        currentPost.isClosed = newValue;
        await showPostDetail(currentPostId);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function toggleCommentPinned(commentId) {
    const token = getToken();
    if (!token) { showMessage('Сначала войдите'); return; }

    const c = currentCommentsList.find(x => x.commentId === commentId);
    if (!c) return;

    const newValue = !c.isPinned;

    try {
        const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ ...c, isPinned: newValue })
        });

        if (!res.ok) {
            showMessage('Ошибка: ' + res.status);
            return;
        }

        await loadComments(currentPostId, currentCommentsCanModerate, false);
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

async function uploadImages(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    const res = await fetch(`${API_URL}/api/images/upload`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: formData
    });

    if (!res.ok) {
        throw new Error(await res.text());
    }

    const data = await res.json();
    return data.ImageUrls || data.imageUrls || [];
}

// обработка выбора картинок для поста
async function handlePostImageUpload(event) {
    const files = event.target.files;
    const errorSpan = document.getElementById('postImageError');
    if (errorSpan) errorSpan.textContent = '';

    if (!files || files.length === 0) return;

    if (currentPostImages.length + files.length > 4) {
        if (errorSpan) errorSpan.textContent = 'Нельзя прикрепить больше 4 изображений';
        event.target.value = '';
        return;
    }

    try {
        if (errorSpan) errorSpan.textContent = 'Загрузка...';
        const urls = await uploadImages(files);
        currentPostImages = currentPostImages.concat(urls);
        renderPostImagesPreview();
        if (errorSpan) errorSpan.textContent = '';
    } catch (e) {
        if (errorSpan) errorSpan.textContent = 'Ошибка: ' + e.message;
    }
    event.target.value = '';
}

function renderPostImagesPreview() {
    const container = document.getElementById('postImagesPreview');
    if (!container) return; 
    
    container.innerHTML = '';
    currentPostImages.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = 'preview-img-wrapper';
        div.innerHTML = `
            <img src="${url}" alt="preview">
            <button class="remove-img-btn" onclick="removePostImage(${index})">×</button>
        `;
        container.appendChild(div);
    });
}

function removePostImage(index) {
    currentPostImages.splice(index, 1);
    renderPostImagesPreview();
}

// обработка выбора картинки для комментария
async function handleCommentImageUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
        const urls = await uploadImages([files[0]]);
        currentCommentImage = urls[0];
        
        const container = document.getElementById('commentImagePreview');
        if (container) {
            container.innerHTML = `
                <div class="preview-img-wrapper">
                    <img src="${currentCommentImage}" alt="preview">
                    <button class="remove-img-btn" onclick="removeCommentImage()">×</button>
                </div>
            `;
        }
    } catch (e) {
        showMessage('Ошибка загрузки: ' + e.message);
    }
    event.target.value = '';
}

function removeCommentImage() {
    currentCommentImage = null;
    const container = document.getElementById('commentImagePreview');
    if (container) container.innerHTML = '';
}

async function loadAdminUsers() {
    const list = document.getElementById('adminUsersList');
    list.innerHTML = '<li style="color:#888;">Загрузка...</li>';
    const token = getToken();

    try {
        const res = await fetch(`${API_URL}/api/users`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Ошибка доступа');

        const users = await res.json();
        
        if (users.length === 0) {
            list.innerHTML = '<li>Пользователей нет</li>';
            return;
        }

        list.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <strong>${escapeHtml(u.username)}</strong> <span style="color:#888;">(ID: ${u.userId})</span>
                    ${u.email ? `<br><small style="color:#666;">${escapeHtml(u.email)}</small>` : ''}
                </div>
                <a href="?profile=${u.userId}" class="small-btn" style="text-decoration:none;">Профиль</a>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.style.display = 'none');

    if (tab === 'users') {
        document.querySelector('.admin-tabs button:nth-child(1)').classList.add('active');
        document.getElementById('adminTabUsers').style.display = 'block';
        loadAdminUsers();
    } else if (tab === 'tags') {
        document.querySelector('.admin-tabs button:nth-child(2)').classList.add('active');
        document.getElementById('adminTabTags').style.display = 'block';
        loadAdminTags();
    } else if (tab === 'subforums') {
        document.querySelector('.admin-tabs button:nth-child(3)').classList.add('active');
        document.getElementById('adminTabSubforums').style.display = 'block';
        loadAdminSubforums();
    }
}

// вкладка тэги
async function loadAdminTags() {
    const list = document.getElementById('adminTagsList');
    list.innerHTML = '<li style="color:#888;">Загрузка...</li>';

    try {
        const res = await fetch(`${API_URL}/api/tags`);
        const tags = await res.json();
        
        if (tags.length === 0) {
            list.innerHTML = '<li>Тегов нет</li>';
            return;
        }

        list.innerHTML = '';
        tags.forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${escapeHtml(t.name)}</span>
                <button class="tag-del-btn" title="Удалить тег" onclick="askDeleteTag(${t.tagId}, '${escapeHtml(t.name)}')">×</button>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

async function loadAdminSubforums() {
    const list = document.getElementById('adminSubforumsList');
    list.innerHTML = '<li style="color:#888;">Загрузка...</li>';

    try {
        const res = await fetch(`${API_URL}/api/subforums`);
        const data = await res.json();
        const activeSubforums = data.filter(s => !s.isDeleted);

        if (activeSubforums.length === 0) {
            list.innerHTML = '<li>Подфорумов нет</li>';
            return;
        }

        list.innerHTML = '';
        activeSubforums.forEach(s => {
            const li = document.createElement('li');
            const subName = s.name || s.title || ('Подфорум ' + s.subforumId);
            const subId = s.subforumId ?? s.id;
            
            li.innerHTML = `
                <span>${escapeHtml(subName)}</span>
                <button class="tag-del-btn" title="Удалить подфорум" onclick="askDeleteSubforum(${subId}, '${escapeHtml(subName)}')">×</button>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

async function createTag() {
    const input = document.getElementById('newTagName');
    const name = input.value.trim();
    if (!name) return showMessage('Введите название тега');

    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/tags`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ name: name })
        });

        if (!res.ok) {
            const text = await res.text();
            showMessage(`Ошибка ${res.status}: ${text}`);
            return;
        }

        input.value = '';
        await loadTags();
        loadAdminTags();
    } catch (e) {
        showMessage('Ошибка сети: ' + e.message);
    }
}

function askDeleteTag(id, name) {
    showConfirm(
        `Вы действительно хотите удалить тег «${name}»?`,
        () => deleteTag(id),
        'Удаление тега',
        'Удалить'
    );
}

async function deleteTag(id) {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/tags/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!res.ok) {
            showMessage('Ошибка удаления: ' + res.status);
            return;
        }

        await loadTags();
        loadAdminTags();
        loadPosts();
    } catch (e) {
        showMessage('Ошибка: ' + e.message);
    }
}

function updateNavUI() {
    const myPostsNav = document.getElementById('navMyPosts');
    if (isShowingMyPosts) {
        myPostsNav.classList.add('active');
    } else {
        myPostsNav.classList.remove('active');
    }
}

function goToMainPage(e) {
    if (e) e.preventDefault();
    window.history.pushState({}, '', window.location.pathname);
    isShowingMyPosts = false;
    currentSubforumId = null;
    currentPostsPage = 1;
    updateNavUI();

    hideAllSections();
    document.getElementById('appSection').className = 'section';

    renderSubforums();
    loadPosts();
}

function goToMyPosts(e) {
    if (e) e.preventDefault();
    if (!getToken()) {
        showMessage('Войдите, чтобы увидеть свои посты');
        return;
    }
    window.history.pushState({}, '', '?my-posts=1');
    isShowingMyPosts = true;
    currentSubforumId = null;
    currentPostsPage = 1;
    updateNavUI();

    hideAllSections();
    document.getElementById('appSection').className = 'section';

    renderSubforums();
    loadPosts();
}

function triggerSearch() {
    const input = document.getElementById('globalSearchInput');
    currentSearchQuery = input.value.trim();
    currentPostsPage = 1; 
    
    const params = new URLSearchParams();
    if (isShowingMyPosts) params.set('my-posts', '1');
    if (currentSubforumId !== null) params.set('subforum', currentSubforumId);
    if (currentSearchQuery) params.set('search', currentSearchQuery);
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);

    renderSubforums();
    loadPosts();
}