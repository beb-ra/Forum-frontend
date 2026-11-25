async function loadSubforums() {
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/subforums`, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (!res.ok) {
            showMessage(await parseApiError(res, 'Не удалось загрузить подфорумы'));
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
        currentTagId = null;
        currentPostsPage = 1;
        updateNavUI();
        renderSubforums();
        renderSubforumSelect();
        loadPosts();
        updateBanStatus();

        const params = new URLSearchParams();
        if (isShowingMyPosts) params.set('my-posts', '1');
        if (id !== null) params.set('subforum', id);

        const newUrl = params.toString()
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;
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

async function createSubforum(btn) {
    return withBtnLock(btn, async () => {
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
                showMessage(await parseApiError(res));
                return;
            }

            nameEl.value = '';
            await loadSubforums();
            await loadAdminSubforums();
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
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
            showMessage(await parseApiError(postsRes, 'Не удалось получить список постов'));
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
            showMessage(await parseApiError(res, 'Ошибка удаления подфорума'));
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

async function votePost(postId, value, btn) {
    return withBtnLock(btn, async () => {
        const ok = await voteOnTarget('post', postId, value);
        if (!ok) return;

        const newScore = computeScore('post', postId);

        const p = posts.find(x => x.postId === postId);
        if (p) p.rating = newScore;
        if (currentPost && currentPost.postId === postId) currentPost.rating = newScore;

        updateVoteUI('post', postId, newScore);
    });
}

async function voteComment(commentId, value, btn) {
    return withBtnLock(btn, async () => {
        const ok = await voteOnTarget('comment', commentId, value);
        if (!ok) return;
        const newScore = computeScore('comment', commentId);
        const c = currentCommentsList.find(x => x.commentId === commentId);
        if (c) c.rating = newScore;
        updateVoteUI('comment', commentId, newScore);
    });
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
            if (!res.ok) {
                showMessage(await parseApiError(res, 'Ошибка отмены голоса'));
                return false;
            }
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
            if (!res.ok) {
                showMessage(await parseApiError(res, 'Ошибка голосования'));
                return false;
            }
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
        if (currentTagId !== null) url += `&tagId=${currentTagId}`;
        if (currentSearchQuery) {
            url += `&search=${encodeURIComponent(currentSearchQuery)}`;
        }
        const res = await fetch(url, {
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (!res.ok) {
            showMessage(await parseApiError(res, 'Не удалось загрузить посты'));
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
    if (currentTagId) {
        labelText += ` (тег: ${tagName(currentTagId)})`;
    }
    label.textContent = labelText;

    if (posts.length === 0) {
        container.innerHTML = 'Постов пока нет.';
        return;
    }

    posts.forEach(p => {
        const div = document.createElement('div');
        div.className = 'post' + (p.isPinned ? ' pinned' : '');
        div.style.cursor = 'pointer';
        div.onclick = (e) => {
            if (e.target.closest('a') || e.target.closest('button')) return;
            window.location.href = `?post=${p.postId}`;
        };

        const author = usersCache[p.authorId] || ('Пользователь ' + p.authorId);
        const tag = p.tagId != null ? tagName(p.tagId) : null;
        const imagesHtml = (p.images && p.images.length > 0)
            ? `<div class="post-images-container">${p.images.map(img => `<img src="${img.imageUrl}" alt="">`).join('')}</div>`
            : '';

        div.innerHTML = `
            <div class="post-header">
                ${p.isPinned ? '📌' : ''}
                ${p.isClosed ? '🔒' : ''}
                <a class="post-title-link" href="?post=${p.postId}">${escapeHtml(p.title)}</a>
            </div>
            <div class="post-content">${escapeHtml(p.content)}</div>
            ${imagesHtml}
            <div class="post-meta">
                Автор: <a class="author-link" href="?profile=${p.authorId}">${escapeHtml(author)}</a>
                ${tag ? ` | Тег: <a href="?tag=${p.tagId}" class="tag-link" onclick="goToTag(event, ${p.tagId})">${escapeHtml(tag)}</a>` : ''}
                ${p.commentCount ? ` | <a class="post-title-link" href="?post=${p.postId}">💬</a> ${p.commentCount}` : ''}
                ${renderVoteControls('post', p.postId, p.rating ?? 0)}
            </div>
        `;
        container.appendChild(div);
    });

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

async function createPost(btn) {
    return withBtnLock(btn, async () => {
        const token = getToken();
        if (!token) { showMessage('Сначала войдите'); return; }
        const sel = document.getElementById('postSubforumId');
        const subforumId = parseInt(sel.value, 10);
        const tagSel = document.getElementById('postTagId').value;
        const tagId = tagSel ? parseInt(tagSel, 10) : null;
        const title = document.getElementById('postTitle').value;
        const content = document.getElementById('postContent').value;

        if (!subforums.length || !sel.value) {
            showMessage('Нет доступных подфорумов');
            return;
        }
        if (!title || !content) {
            showMessage('Заполните заголовок и текст', false);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ subforumId, title, content, tagId, imageUrls: currentPostImages })
            });

            if (!res.ok) {
                showMessage(await parseApiError(res));
                return;
            }

            document.getElementById('postTitle').value = '';
            document.getElementById('postContent').value = '';
            const previewContainer = document.getElementById('postImagesPreview');
            if (previewContainer) {
                previewContainer.innerHTML = '';
            }
            closeCreatePostModal();
            currentPostImages = [];
            currentPostsPage = 1;
            loadPosts();
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function showPostDetail(postId) {
    showPostDetailSection();
    currentPostId = parseInt(postId, 10);
    const token = getToken();
    const container = document.getElementById('postDetailContent');
    container.innerHTML = '';

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
            ? `<div class="post-images-container">${p.images.map(img => `<img src="${img.imageUrl}" alt="">`).join('')}</div>`
            : '';

        let html = `
            <h2>${escapeHtml(p.title)}</h2>
            <div class="post-meta" style="margin-bottom: 10px;">
                ${p.isPinned ? '<span class="badge-pin" title="Закреплено">📌 Закреплено</span>' : ''}
                ${p.isClosed ? '<span class="badge-closed" title="Закрыто">🔒 Закрыто</span>' : ''}
                Автор: <a class="author-link" href="?profile=${p.authorId}">${escapeHtml(author)}</a>
                | Подфорум: ${escapeHtml(subName)}
                | Дата: ${formatDate(p.creationDate)}
                ${tag ? `| Тег: ${escapeHtml(tag)}` : ''}
            </div>
            ${renderVoteControls('post', p.postId, p.rating ?? 0)}
            <div class="post-content">${escapeHtml(p.content)}</div>
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
                html += `<button class="pin-toggle${p.isPinned ? ' active' : ''}" title="${p.isPinned ? 'Открепить' : 'Закрепить'}" onclick="togglePostPinned(this)">📌</button>`;
                html += `<button class="close-toggle${p.isClosed ? ' active' : ''}" title="${p.isClosed ? 'Открыть пост' : 'Закрыть пост'}" onclick="togglePostClosed(this)">${p.isClosed ? '🔒' : '🔓'}</button>`;
            }
            if (canMod && Object.keys(tagsCache).length > 0) {
                const options = Object.entries(tagsCache).map(([id, name]) =>
                    `<option value="${id}" ${String(p.tagId) === String(id) ? 'selected' : ''}>${escapeHtml(name)}</option>`
                ).join('');
                html += `
                    Тег:
                    <select id="tagSelect">
                        <option value="">— Без тега —</option>
                        ${options}
                    </select>
                    <button onclick="savePostTag(this)">Сохранить тег</button>
                `;
            }
            if (canDeletePost) {
                html += `<button class="danger" onclick="deleteCurrentPost(this)">Удалить пост</button>`;
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
    currentPostImages = (p.images || []).map(img => img.imageUrl);
    const container = document.getElementById('postDetailContent');
    container.innerHTML = `
        <h3>Редактирование поста</h3>
        <label>Заголовок:</label>
        <input id="editPostTitle" type="text">
        <label>Текст:</label>
        <textarea id="editPostContent" rows="6"></textarea>
        <input type="file" id="editPostImageInput" accept="image/*" style="display:none" onchange="handleEditPostImageUpload(event)">
        <button id="editPostAttachBtn" type="button" onclick="document.getElementById('editPostImageInput').click()">📎</button>
        <span id="editPostImageError" style="color:#dc3545; font-size:12px;"></span>
        <div id="editPostImagesPreview"></div>
        <div class="form-actions">
            <button class="success" onclick="saveEditedPost(this)">Сохранить</button>
            <button class="logout" onclick="showPostDetail(currentPostId)">Отмена</button>
        </div>
    `;
    document.getElementById('editPostTitle').value = p.title;
    document.getElementById('editPostContent').value = p.content;
    renderEditPostImagesPreview();
    updateAttachButtons();
}

async function handleEditPostImageUpload(event) {
    const files = event.target.files;
    const errorSpan = document.getElementById('editPostImageError');
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
        renderEditPostImagesPreview();
        updateAttachButtons();
        if (errorSpan) errorSpan.textContent = '';
    } catch (e) {
        if (errorSpan) errorSpan.textContent = 'Ошибка: ' + e.message;
    }
    event.target.value = '';
}

function renderEditPostImagesPreview() {
    const container = document.getElementById('editPostImagesPreview');
    if (!container) return;
    container.innerHTML = '';
    currentPostImages.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = 'preview-img-wrapper';
        div.innerHTML = `<img src="${url}" alt="preview"> <button class="remove-img-btn" onclick="removeEditPostImage(${index})">×</button>`;
        container.appendChild(div);
    });
}

function removeEditPostImage(index) {
    currentPostImages.splice(index, 1);
    renderEditPostImagesPreview();
    updateAttachButtons();
}

async function saveEditedPost(btn) {
    return withBtnLock(btn, async () => {
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
                body: JSON.stringify({
                    ...currentPost, title, content,
                    images: currentPostImages.map(url => ({ imageUrl: url }))
                })
            });
            if (!res.ok) {
                showMessage(await parseApiError(res));
                return;
            }
            await showPostDetail(currentPostId);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function savePostTag(btn) {
    return withBtnLock(btn, async () => {
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
                showMessage(await parseApiError(res));
                return;
            }
            await showPostDetail(currentPostId);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function deleteCurrentPost(btn) {
    return withBtnLock(btn, async () => {
        if (!confirm('Удалить этот пост?')) return;
        const token = getToken();
        if (!token) { showMessage('Сначала войдите'); return; }
        try {
            const res = await fetch(`${API_URL}/api/posts/${currentPostId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) {
                showMessage(await parseApiError(res, 'Ошибка удаления'));
                return;
            }
            setTimeout(() => { window.location.href = window.location.pathname; }, 500);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

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
        ? `<button class="pin-btn${node.isPinned ? ' active' : ''}" title="${node.isPinned ? 'Открепить' : 'Закрепить'}" onclick="toggleCommentPinned(${node.commentId}, this)">📌</button>`
        : '';
    const replyBtn = `<button class="comment-del-btn reply-btn" onclick="startReply(${node.commentId})">Ответить</button>`;
    const editBtn = isAuthor
        ? `<button class="logout comment-del-btn" onclick="startEditComment(${node.commentId})">Изменить</button>`
        : '';
    const delBtn = canDelete
        ? `<button class="danger comment-del-btn" onclick="deleteCommentById(${node.commentId}, this)">Удалить</button>`
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
        <div>${node.content ? escapeHtml(node.content) : ''}</div>
        ${commentImageHtml}
        <div id="reply-form-${node.commentId}" class="reply-form" style="display: none;">
            <textarea id="reply-text-${node.commentId}" rows="2" placeholder="Ваш ответ..."></textarea>
            <div class="form-actions">
                <button class="success" onclick="submitReply(${node.commentId}, this)">Отправить</button>
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
    containerElement.innerHTML = 'Загрузка ответов...';
    try {
        const res = await fetch(`${API_URL}/api/comments?postId=${currentPostId}&parentCommentId=${commentId}`);
        if (!res.ok) throw new Error('Ошибка при загрузке ответов');
        const data = await res.json();
        containerElement.innerHTML = '';
        if (data.items.length === 0) {
            containerElement.innerHTML = 'Ответов нет.';
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

async function submitReply(parentCommentId, btn) {
    return withBtnLock(btn, async () => {
        const token = getToken();
        if (!token) { showMessage('Сначала войдите'); return; }
        const ta = document.getElementById('reply-text-' + parentCommentId);
        if (!ta) return;
        const content = ta.value.trim();
        if (!content && !currentCommentImage) {
            showMessage('Введите текст или прикрепите картинку');
            return;
        }
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
                showMessage(await parseApiError(res));
                return;
            }
            await loadComments(pid, currentCommentsCanModerate, false);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

function startEditComment(commentId) {
    const c = currentCommentsList.find(x => x.commentId === commentId);
    const div = document.getElementById('comment-' + commentId);
    if (!div) return;
    currentCommentImage = c.imageUrl || null;
    const content = div.querySelector('div:nth-child(2)')
        ? div.querySelector('div:nth-child(2)').innerText
        : '';

    div.innerHTML = `
        <div class="comment-meta">
            ${escapeHtml(usersCache[c?.authorId] || 'Пользователь')} · редактирование
        </div>
        <textarea id="editCommentText-${commentId}" rows="3" style="width:100%">${escapeHtml(content)}</textarea>
        <input type="file" id="editCommentImageInput-${commentId}" accept="image/*" style="display:none" onchange="handleEditCommentImageUpload(event, ${commentId})">
        <div id="editCommentImagePreview-${commentId}">
            ${currentCommentImage ? `<div class="preview-img-wrapper"><img src="${currentCommentImage}" alt="preview"><button class="remove-img-btn" onclick="removeEditCommentImage(${commentId})">×</button></div>` : ''}
        </div>
        <button id="editCommentAttachBtn-${commentId}" type="button" onclick="document.getElementById('editCommentImageInput-${commentId}').click()">📎</button>
        <div class="form-actions">
            <button class="success" onclick="saveEditedComment(${commentId}, this)">Сохранить</button>
            <button class="logout" onclick="loadComments(currentPostId, currentCommentsCanModerate, false)">Отмена</button>
        </div>
    `;
    document.getElementById('editCommentText-' + commentId).value = c.content || '';
    const btn = document.getElementById('editCommentAttachBtn-' + commentId);
    if (btn) btn.style.display = currentCommentImage ? 'none' : 'inline-block';
}

async function handleEditCommentImageUpload(event, commentId) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const urls = await uploadImages([file]);
        currentCommentImage = urls[0];
        document.getElementById('editCommentImagePreview-' + commentId).innerHTML = `
            <div class="preview-img-wrapper">
                <img src="${currentCommentImage}" alt="preview">
                <button class="remove-img-btn" onclick="currentCommentImage = null; this.parentElement.remove();">×</button>
            </div>
        `;
        const btn = document.getElementById('editCommentAttachBtn-' + commentId);
        if (btn) btn.style.display = 'none';
    } catch (e) {
        showMessage('Ошибка загрузки: ' + e.message);
    }
    event.target.value = '';
}

async function saveEditedComment(commentId, btn) {
    return withBtnLock(btn, async () => {
        const token = getToken();
        if (!token) { showMessage('Сначала войдите'); return; }
        const textarea = document.getElementById('editCommentText-' + commentId);
        if (!textarea) return;
        const content = textarea.value.trim();
        if (!content && !currentCommentImage) {
            showMessage('Введите текст или прикрепите картинку');
            return;
        }
        try {
            const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ content: content, imageUrl: currentCommentImage })
            });
            if (!res.ok) {
                showMessage(await parseApiError(res));
                return;
            }
            await loadComments(currentPostId, currentCommentsCanModerate, false);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function deleteCommentById(id, btn) {
    return withBtnLock(btn, async () => {
        if (!confirm('Удалить комментарий?')) return;
        const token = getToken();
        if (!token) { showMessage('Сначала войдите'); return; }
        try {
            const res = await fetch(`${API_URL}/api/comments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) {
                showMessage(await parseApiError(res, 'Ошибка удаления'));
                return;
            }
            await loadComments(currentPostId, currentCommentsCanModerate, false);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function submitComment(btn) {
    return withBtnLock(btn, async () => {
        const token = getToken();
        if (!token) { showMessage('Сначала войдите'); return; }
        const contentEl = document.getElementById('newCommentContent');
        const content = contentEl.value.trim();
        if (!content && !currentCommentImage) {
            showMessage('Введите текст или прикрепите картинку');
            return;
        }
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
                showMessage(await parseApiError(res));
                return;
            }
            contentEl.value = '';
            currentCommentImage = null;
            const cPreview = document.getElementById('commentImagePreview');
            if (cPreview) cPreview.innerHTML = '';
            updateAttachButtons();
            await loadComments(pid, currentCommentsCanModerate, false);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function togglePostPinned(btn) {
    return withBtnLock(btn, async () => {
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
                showMessage(await parseApiError(res, 'Ошибка закрепления'));
                return;
            }
            currentPost.isPinned = newValue;
            await showPostDetail(currentPostId);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function togglePostClosed(btn) {
    return withBtnLock(btn, async () => {
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
                showMessage(await parseApiError(res, 'Ошибка закрытия поста'));
                return;
            }
            currentPost.isClosed = newValue;
            await showPostDetail(currentPostId);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

async function toggleCommentPinned(commentId, btn) {
    return withBtnLock(btn, async () => {
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
                showMessage(await parseApiError(res, 'Ошибка закрепления'));
                return;
            }
            await loadComments(currentPostId, currentCommentsCanModerate, false);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
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
        throw new Error(await parseApiError(res, 'Ошибка загрузки файла'));
    }
    const data = await res.json();
    return data.ImageUrls || data.imageUrls || [];
}

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
        updateAttachButtons();
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
        div.innerHTML = `<img src="${url}" alt="preview"> <button class="remove-img-btn" onclick="removePostImage(${index})">×</button>`;
        container.appendChild(div);
    });
}

function removePostImage(index) {
    currentPostImages.splice(index, 1);
    renderPostImagesPreview();
    updateAttachButtons();
}

async function handleCommentImageUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    try {
        const urls = await uploadImages([files[0]]);
        currentCommentImage = urls[0];
        const container = document.getElementById('commentImagePreview');
        if (container) {
            container.innerHTML = `<div class="preview-img-wrapper"><img src="${currentCommentImage}" alt="preview"><button class="remove-img-btn" onclick="removeCommentImage()">×</button></div>`;
        }
        updateAttachButtons();
    } catch (e) {
        showMessage('Ошибка загрузки: ' + e.message);
    }
    event.target.value = '';
}

function removeCommentImage() {
    currentCommentImage = null;
    const container = document.getElementById('commentImagePreview');
    if (container) container.innerHTML = '';
    updateAttachButtons();
}

async function loadAdminUsers() {
    const list = document.getElementById('adminUsersList');
    list.innerHTML = 'Загрузка...';
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/users`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Ошибка доступа');
        const users = await res.json();
        if (users.length === 0) {
            list.innerHTML = 'Пользователей нет';
            return;
        }
        list.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <strong>${escapeHtml(u.username)}</strong>
                    <span style="color:#888;">(ID: ${u.userId})</span>
                    ${u.email ? `<br>${escapeHtml(u.email)}` : ''}
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
    } else if (tab === 'moderation') {
        document.querySelector('.admin-tabs button:nth-child(2)').classList.add('active');
        document.getElementById('adminTabModeration').style.display = 'block';
        loadPendingModeration('adminPendingList');
    } else if (tab === 'bans') {
        document.querySelector('.admin-tabs button:nth-child(3)').classList.add('active');
        document.getElementById('adminTabBans').style.display = 'block';
        loadBansList('adminBansList');
    } else if (tab === 'deleted') {
        document.querySelector('.admin-tabs button:nth-child(4)').classList.add('active');
        document.getElementById('adminTabDeleted').style.display = 'block';
        loadDeletedModeration('adminDeletedList');
    } else if (tab === 'tags') {
        document.querySelector('.admin-tabs button:nth-child(5)').classList.add('active');
        document.getElementById('adminTabTags').style.display = 'block';
        loadAdminTags();
    } else if (tab === 'subforums') {
        document.querySelector('.admin-tabs button:nth-child(6)').classList.add('active');
        document.getElementById('adminTabSubforums').style.display = 'block';
        loadAdminSubforums();
    }
}

async function loadAdminTags() {
    const list = document.getElementById('adminTagsList');
    list.innerHTML = 'Загрузка...';
    try {
        const res = await fetch(`${API_URL}/api/tags`);
        const tags = await res.json();
        if (tags.length === 0) {
            list.innerHTML = 'Тегов нет';
            return;
        }
        list.innerHTML = '';
        tags.forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${escapeHtml(t.name)}</span> <button class="tag-del-btn" title="Удалить тег" onclick="askDeleteTag(${t.tagId}, '${escapeHtml(t.name)}')">×</button>`;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

async function loadAdminSubforums() {
    const list = document.getElementById('adminSubforumsList');
    list.innerHTML = 'Загрузка...';
    try {
        const res = await fetch(`${API_URL}/api/subforums`);
        const data = await res.json();
        const activeSubforums = data.filter(s => !s.isDeleted);
        if (activeSubforums.length === 0) {
            list.innerHTML = 'Подфорумов нет';
            return;
        }
        list.innerHTML = '';
        activeSubforums.forEach(s => {
            const li = document.createElement('li');
            const subName = s.name || s.title || ('Подфорум ' + s.subforumId);
            const subId = s.subforumId ?? s.id;
            li.innerHTML = `<span>${escapeHtml(subName)}</span> <button class="tag-del-btn" title="Удалить подфорум" onclick="askDeleteSubforum(${subId}, '${escapeHtml(subName)}')">×</button>`;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

async function createTag(btn) {
    return withBtnLock(btn, async () => {
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
                showMessage(await parseApiError(res));
                return;
            }
            input.value = '';
            await loadTags();
            loadAdminTags();
        } catch (e) {
            showMessage('Ошибка сети: ' + e.message);
        }
    });
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
            showMessage(await parseApiError(res, 'Ошибка удаления'));
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
    currentTagId = null;
    currentPostsPage = 1;
    updateNavUI();
    hideAllSections();
    document.getElementById('appSection').className = 'section';
    updateUserInfoHeader();
    updateBanStatus();
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
    currentTagId = null;
    currentPostsPage = 1;
    updateNavUI();
    hideAllSections();
    document.getElementById('appSection').className = 'section';
    updateUserInfoHeader();
    updateBanStatus();
    renderSubforums();
    loadPosts();
}

function triggerSearch() {
    const input = document.getElementById('globalSearchInput');
    currentSearchQuery = input.value.trim();
    currentPostsPage = 1;
    currentTagId = null;

    const params = new URLSearchParams();
    if (isShowingMyPosts) params.set('my-posts', '1');
    if (currentSubforumId !== null) params.set('subforum', currentSubforumId);
    if (currentSearchQuery) params.set('search', currentSearchQuery);

    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    renderSubforums();
    loadPosts();
}

function openCreatePostModal() {
    if (!getToken()) {
        showMessage('Сначала войдите');
        return;
    }
    renderSubforumSelect();
    renderPostTagSelect();
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    currentPostImages = [];
    renderPostImagesPreview();
    updateAttachButtons();
    document.getElementById('createPostModal').classList.add('open');
}

function closeCreatePostModal() {
    document.getElementById('createPostModal').classList.remove('open');
}

function renderPostTagSelect() {
    const sel = document.getElementById('postTagId');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Без тега —</option>';
    Object.entries(tagsCache).forEach(([id, name]) => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = name;
        sel.appendChild(o);
    });
}

function goToTag(e, tagId) {
    if (e) e.preventDefault();
    currentTagId = tagId;
    currentPostsPage = 1;

    const params = new URLSearchParams();
    if (isShowingMyPosts) params.set('my-posts', '1');
    if (currentSubforumId !== null) params.set('subforum', currentSubforumId);
    if (currentTagId !== null) params.set('tag', currentTagId);
    if (currentSearchQuery) params.set('search', currentSearchQuery);

    const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    loadPosts();
}

function openModeratorToolsModal() {
    document.getElementById('moderatorToolsModal').classList.add('open');
    switchModTab('pending');
}

function closeModeratorToolsModal() {
    document.getElementById('moderatorToolsModal').classList.remove('open');
}

function switchModTab(tab) {
    document.querySelectorAll('#moderatorToolsModal .admin-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#moderatorToolsModal .admin-tab-content').forEach(content => content.style.display = 'none');

    if (tab === 'users') {
        document.querySelector('#moderatorToolsModal .admin-tabs button:nth-child(3)').classList.add('active');
        document.getElementById('modTabUsers').style.display = 'block';
        loadModeratorUsers();
    } else if (tab === 'pending') {
        document.querySelector('#moderatorToolsModal .admin-tabs button:nth-child(1)').classList.add('active');
        document.getElementById('modTabPending').style.display = 'block';
        loadPendingModeration('modPendingList');
    } else if (tab === 'bans') {
        document.querySelector('#moderatorToolsModal .admin-tabs button:nth-child(4)').classList.add('active');
        document.getElementById('modTabBans').style.display = 'block';
        loadBansList('modBansList');
    } else if (tab === 'deleted') {
        document.querySelector('#moderatorToolsModal .admin-tabs button:nth-child(2)').classList.add('active');
        document.getElementById('modTabDeleted').style.display = 'block';
        loadDeletedModeration('modDeletedList');
    }
}

async function loadModeratorUsers() {
    const list = document.getElementById('modUsersList');
    list.innerHTML = 'Загрузка...';
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/moderation/users`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Ошибка доступа');
        const users = await res.json();
        if (users.length === 0) {
            list.innerHTML = 'Пользователей нет';
            return;
        }
        list.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <strong>${escapeHtml(u.username)}</strong>
                    <span style="color:#888;">(ID: ${u.userId})</span>
                </div>
                <a href="?profile=${u.userId}" class="small-btn" style="text-decoration:none;">Профиль</a>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

async function loadPendingModeration(containerId) {
    const list = document.getElementById(containerId);
    list.innerHTML = 'Загрузка...';
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/moderation/pending`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Ошибка доступа');
        const data = await res.json();
        const { posts, comments } = data;

        if (posts.length === 0 && comments.length === 0) {
            list.innerHTML = 'Очередь пуста';
            return;
        }

        const authorIds = [
            ...posts.map(p => p.authorId),
            ...comments.map(c => c.authorId)
        ];
        await ensureUsernamesLoaded(authorIds);
        list.innerHTML = '';

        const btnStyle = 'flex: 1; margin: 0; padding: 8px 0; font-size: 13px; text-align: center; box-sizing: border-box;';

        posts.forEach(p => {
            const li = document.createElement('li');
            li.style.flexDirection = 'column';
            li.style.alignItems = 'flex-start';
            li.style.padding = '15px';
            li.style.background = '#fff';
            li.style.marginBottom = '10px';
            li.style.borderRadius = '6px';
            li.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            const imagesHtml = (p.images && p.images.length > 0)
                ? `<div class="post-images-container" style="margin: 10px 0;">${p.images.map(img => `<img src="${img.imageUrl}" alt="">`).join('')}</div>`
                : '';
            const authorName = usersCache[p.authorId] || ('ID ' + p.authorId);

            li.innerHTML = `
                <div style="margin-bottom: 5px; font-size: 16px;">
                    <strong>Пост:</strong>
                    <a href="?post=${p.postId}" target="_blank" class="post-title-link">${escapeHtml(p.title)}</a>
                </div>
                <div style="margin-bottom: 5px; color: #333; font-size: 14px;">${escapeHtml(p.content)}</div>
                ${imagesHtml}
                <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
                    Автор: <a href="?profile=${p.authorId}" target="_blank" class="author-link"><strong>${escapeHtml(authorName)}</strong></a>
                    | Подфорум: ${escapeHtml(subforumName(p.subforumId))}
                </div>
                <div style="display: flex; gap: 10px; width: 100%; align-items: stretch;">
                    <button class="success" style="${btnStyle}" onclick="moderateItem('posts', ${p.postId}, 'approve', '${containerId}', this)">Одобрить</button>
                    <button class="danger" style="${btnStyle}" onclick="moderateItem('posts', ${p.postId}, 'reject', '${containerId}', this)">Удалить</button>
                </div>
            `;
            list.appendChild(li);
        });

        comments.forEach(c => {
            const li = document.createElement('li');
            li.style.flexDirection = 'column';
            li.style.alignItems = 'flex-start';
            li.style.padding = '15px';
            li.style.background = '#fff';
            li.style.marginBottom = '10px';
            li.style.borderRadius = '6px';
            li.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            const imageHtml = c.imageUrl
                ? `<img src="${c.imageUrl}" class="comment-image" style="max-height: 120px; max-width: 100%; object-fit: contain; margin: 10px 0;">`
                : '';
            const authorName = usersCache[c.authorId] || ('ID ' + c.authorId);

            li.innerHTML = `
                <div style="margin-bottom: 5px; font-size: 16px;">
                    <strong>Комментарий:</strong>
                </div>
                <div style="margin-bottom: 5px; color: #333; font-size: 14px;">${escapeHtml(c.content || '')}</div>
                ${imageHtml}
                <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
                    Автор: ${escapeHtml(authorName)}
                    | Пост: ${escapeHtml(c.postTitle || 'Пост')}
                </div>
                <div style="display: flex; gap: 10px; width: 100%; align-items: stretch;">
                    <button class="success" style="${btnStyle}" onclick="moderateItem('comments', ${c.commentId}, 'approve', '${containerId}', this)">Одобрить</button>
                    <button class="danger" style="${btnStyle}" onclick="moderateItem('comments', ${c.commentId}, 'reject', '${containerId}', this)">Удалить</button>
                </div>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

async function moderateItem(type, id, action, containerId, btn) {
    return withBtnLock(btn, async () => {
        const token = getToken();
        const url = `${API_URL}/api/moderation/${type}/${id}/${action}`;
        try {
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) {
                showMessage(await parseApiError(res));
                return;
            }
            loadPendingModeration(containerId);
        } catch (e) {
            showMessage('Ошибка: ' + e.message);
        }
    });
}

function updateAttachButtons() {
    const postBtn = document.getElementById('postAttachBtn');
    if (postBtn) {
        postBtn.style.display = currentPostImages.length >= 4 ? 'none' : 'inline-block';
    }
    const commentBtn = document.getElementById('commentAttachBtn');
    if (commentBtn) {
        commentBtn.style.display = currentCommentImage ? 'none' : 'inline-block';
    }
    const editPostBtn = document.getElementById('editPostAttachBtn');
    if (editPostBtn) {
        editPostBtn.style.display = currentPostImages.length >= 4 ? 'none' : 'inline-block';
    }
}

function removeEditCommentImage(commentId) {
    currentCommentImage = null;
    document.getElementById('editCommentImagePreview-' + commentId).innerHTML = '';
    const btn = document.getElementById('editCommentAttachBtn-' + commentId);
    if (btn) btn.style.display = 'inline-block';
}

async function loadBansList(containerId) {
    const list = document.getElementById(containerId);
    list.innerHTML = 'Загрузка...';
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/bans`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
            list.innerHTML = 'У вас нет прав на просмотр банов.';
            return;
        }
        const bans = await res.json();
        if (bans.length === 0) {
            list.innerHTML = 'Активных банов нет.';
            return;
        }
        const userIds = [...new Set(bans.map(b => b.userId))];
        await ensureUsernamesLoaded(userIds);
        list.innerHTML = '';
        bans.forEach(b => {
            const li = document.createElement('li');
            li.style.flexDirection = 'column';
            li.style.alignItems = 'flex-start';
            li.style.padding = '15px';
            li.style.background = '#fff';
            li.style.marginBottom = '10px';
            li.style.borderRadius = '6px';
            li.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            const userName = usersCache[b.userId] || ('ID ' + b.userId);
            const subName = b.subforumId ? subforumName(b.subforumId) : 'Весь форум';
            const expires = b.expiresDate ? formatDate(b.expiresDate) : 'бессрочно';

            li.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px; color: #dc3545; font-size: 15px;">
                    Забанен: ${escapeHtml(userName)}
                </div>
                <div style="font-size: 13px; color: #444; margin-bottom: 10px; line-height: 1.5;">
                    <strong>Где:</strong> ${escapeHtml(subName)}<br>
                    <strong>Причина:</strong> ${escapeHtml(b.banReason || '—')}<br>
                    <strong>Действует до:</strong> ${escapeHtml(expires)}
                </div>
                <button class="success" style="margin: 0; padding: 6px 15px; font-size: 13px;" onclick="askUnbanUserFromModal(${b.banId}, this, '${containerId}')">Разбанить</button>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

function updateUserInfoHeader() {
    const userEl = document.getElementById('currentUser');
    if (userEl) userEl.textContent = localStorage.getItem('username') || '—';
    if (typeof renderRoleBadges === 'function') {
        renderRoleBadges();
    }
    const isAdmin = typeof isGlobalAdmin === 'function' && isGlobalAdmin();
    const isMod = typeof getModeratedSubforumIds === 'function' && getModeratedSubforumIds().length > 0;
    const modBtn = document.getElementById('moderatorToolsBtn');
    if (modBtn) modBtn.style.display = isMod ? 'inline-block' : 'none';
    const adminBtn = document.getElementById('adminToolsBtn');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
    loadNotifications();
}

async function updateBanStatus() {
    const banSpan = document.getElementById('userBanStatus');
    if (!banSpan) return;
    const token = getToken();
    if (!token) {
        banSpan.textContent = '';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/bans/me`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) return;
        const bans = await res.json();
        const now = new Date();

        const globalBan = bans.find(b =>
            b.subforumId === null && (!b.expiresDate || new Date(b.expiresDate) > now)
        );
        if (globalBan) {
            const expires = globalBan.expiresDate ? `до ${formatDate(globalBan.expiresDate)}` : 'навсегда';
            banSpan.textContent = `Бан на всем форуме (${expires}). Причина: ${globalBan.banReason || '—'}`;
            return;
        }

        if (currentSubforumId !== null) {
            const subBan = bans.find(b =>
                b.subforumId === currentSubforumId && (!b.expiresDate || new Date(b.expiresDate) > now)
            );
            if (subBan) {
                const expires = subBan.expiresDate ? `до ${formatDate(subBan.expiresDate)}` : 'навсегда';
                banSpan.textContent = `Бан в подфоруме «${subforumName(subBan.subforumId)}» (${expires}). Причина: ${subBan.banReason || '—'}`;
                return;
            }
        }
        banSpan.textContent = '';
    } catch (e) {
        console.error('Ошибка загрузки', e);
    }
}

async function loadDeletedModeration(containerId) {
    const list = document.getElementById(containerId);
    list.innerHTML = 'Загрузка...';
    const token = getToken();
    try {
        const res = await fetch(`${API_URL}/api/moderation/deleted`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Ошибка доступа');
        const data = await res.json();
        const { posts, comments } = data;

        if (posts.length === 0 && comments.length === 0) {
            list.innerHTML = 'Удаленных записей нет.';
            return;
        }

        const authorIds = [...posts.map(p => p.authorId), ...comments.map(c => c.authorId)];
        await ensureUsernamesLoaded(authorIds);
        list.innerHTML = '';

        const btnStyle = 'flex: 1; margin: 0; padding: 8px 0; font-size: 13px; text-align: center; box-sizing: border-box;';

        posts.forEach(p => {
            const li = document.createElement('li');
            li.style.flexDirection = 'column';
            li.style.alignItems = 'flex-start';
            li.style.padding = '15px';
            li.style.background = '#fff';
            li.style.marginBottom = '10px';
            li.style.borderRadius = '6px';
            li.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            const authorName = usersCache[p.authorId] || ('ID ' + p.authorId);

            li.innerHTML = `
                <div style="margin-bottom: 5px; font-size: 16px; color: #dc3545;">
                    <strong>Пост:</strong> ${escapeHtml(p.title)}
                </div>
                <div style="margin-bottom: 5px; color: #333; font-size: 14px;">${escapeHtml(p.content)}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
                    Автор: ${escapeHtml(authorName)}
                    | Подфорум: ${escapeHtml(subforumName(p.subforumId))}
                </div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button class="success" style="${btnStyle}" onclick="restoreModerationItem('posts', ${p.postId}, '${containerId}')">Восстановить</button>
                </div>
            `;
            list.appendChild(li);
        });

        comments.forEach(c => {
            const li = document.createElement('li');
            li.style.flexDirection = 'column';
            li.style.alignItems = 'flex-start';
            li.style.padding = '15px';
            li.style.background = '#fff';
            li.style.marginBottom = '10px';
            li.style.borderRadius = '6px';
            li.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

            const authorName = usersCache[c.authorId] || ('ID ' + c.authorId);

            li.innerHTML = `
                <div style="margin-bottom: 5px; font-size: 14px; color: #dc3545;">
                    <strong>Комментарий:</strong> ${escapeHtml(c.content || '')}
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
                    Автор: ${escapeHtml(authorName)}
                    | Пост: ${escapeHtml(c.postTitle || 'Пост')}
                </div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button class="success" style="${btnStyle}" onclick="restoreModerationItem('comments', ${c.commentId}, '${containerId}')">Восстановить</button>
                </div>
            `;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li style="color:#dc3545;">Ошибка: ${e.message}</li>`;
    }
}

function restoreModerationItem(type, id, containerId) {
    const itemName = type === 'posts' ? 'пост' : 'комментарий';
    showConfirm(
        `Вы действительно хотите восстановить ${itemName}?`,
        async () => {
            const token = getToken();
            const url = `${API_URL}/api/moderation/${type}/${id}/restore`;
            try {
                const res = await fetch(url, {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) {
                    showMessage(await parseApiError(res));
                    return;
                }
                loadDeletedModeration(containerId);
            } catch (e) {
                showMessage('Ошибка: ' + e.message);
            }
        },
        'Восстановление',
        'Восстановить'
    );
}

async function loadNotifications() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}/api/notifications`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) return;
        notifications = await res.json();
        const senderIds = notifications.map(n => n.senderId).filter(id => id != null);
        await ensureUsernamesLoaded(senderIds);
        renderNotifications();
    } catch (e) { }
}

function renderNotifications() {
    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if (!list || !badge) return;

    const unreadCount = notifications.filter(n => !n.isRead).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }

    if (notifications.length === 0) {
        list.innerHTML = '<li style="padding: 15px; text-align: center; color: #888;">Уведомлений нет</li>';
        return;
    }

    list.innerHTML = '';
    notifications.forEach(n => {
        const li = document.createElement('li');
        li.style.padding = '10px';
        li.style.borderBottom = '1px solid #eee';
        li.style.cursor = 'pointer';
        li.style.background = n.isRead ? '#fff' : '#f0f8ff';
        li.onclick = () => {
            if (!n.isRead) markNotificationRead(n.id);
        };

        let senderHtml = '';
        if (n.senderId) {
            const senderName = usersCache[n.senderId] || 'Пользователь';
            senderHtml = `<a href="?profile=${n.senderId}" class="author-link" onclick="event.stopPropagation()">${escapeHtml(senderName)}</a> `;
        }

        let msgHtml = escapeHtml(n.message);
        if (n.postId) {
            msgHtml = msgHtml.replace(
                'на ваш комментарий',
                `на ваш <a href="?post=${n.postId}" class="notif-link" onclick="event.stopPropagation()">комментарий</a>`
            );
            msgHtml = msgHtml.replace(
                'под вашим постом',
                `под вашим <a href="?post=${n.postId}" class="notif-link" onclick="event.stopPropagation()">постом</a>`
            );
        }

        li.innerHTML = `
            <div style="font-size: 13px; color: #333;">
                ${senderHtml}${msgHtml}
            </div>
            <div style="font-size: 11px; color: #888; margin-top: 4px;">${formatDate(n.creationDate)}</div>
        `;
        list.appendChild(li);
    });
}

function toggleNotifications() {
    const dropdown = document.getElementById('notifDropdown');
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) {
        loadNotifications();
    }
}

async function markNotificationRead(id) {
    const token = getToken();
    if (!token) return;
    try {
        await fetch(`${API_URL}/api/notifications/${id}/read`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const n = notifications.find(x => x.id === id);
        if (n) n.isRead = true;
        renderNotifications();
    } catch (e) { }
}

async function markAllNotificationsRead() {
    const token = getToken();
    if (!token) return;
    try {
        await fetch(`${API_URL}/api/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        notifications.forEach(n => n.isRead = true);
        renderNotifications();
    } catch (e) { }
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notifDropdown');
    const btn = document.getElementById('notifBellBtn');
    if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

setInterval(() => {
    if (getToken()) loadNotifications();
}, 30000);

async function pingActivity() {
    const token = getToken();
    if (!token) return;
    try {
        await fetch(`${API_URL}/api/users/me/activity`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        });
    } catch (e) { }
}

setInterval(() => {
    if (getToken()) pingActivity();
}, 60000);

if (getToken()) {
    pingActivity();
}