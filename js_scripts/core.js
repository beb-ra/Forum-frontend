const API_URL = 'https://forum-6sgl.onrender.com';

let subforums = [];
let posts = [];
let currentSubforumId = null;
let usersCache = {};
let tagsCache = {};
let tagsLoaded = false;
let currentPostId = null;
let currentPostCanModerate = false;
let currentPost = null;
let currentComments = [];
let votes = [];
let currentPostsPage = 1;
let totalPostsPages = 1;
const postsPerPage = 10;
let currentCommentsPage = 1;
let totalCommentsPages = 1;
const commentsPerPage = 10;
let currentCommentsList = [];
let pendingConfirmAction = null;
let rolesList = [];
let currentRolesProfileId = null;
let currentBanProfileId = null;
let currentPostImages = [];
let currentCommentImage = null;
let isShowingMyPosts = false;
let currentSearchQuery = '';
let tempAvatarUrl = null;
let currentTagId = null;
let loadingTimeout;
let notifications = [];
let isShowingUsers = false;
let usersList = [];
let currentUsersPage = 1;
let totalUsersPages = 1;
const usersPerPage = 10;

function ensureAlertModal() {
    let overlay = document.getElementById('alertModal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'alertModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal alert-modal-box">
            <h2 id="alertModalTitle" class="alert-modal-title is-error">Сообщение</h2>
            <p id="alertModalText" class="alert-modal-text"></p>
            <div class="alert-modal-actions">
                <button type="button" id="alertModalOkBtn" onclick="closeAlertModal()">ОК</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAlertModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function closeAlertModal() {
    const overlay = document.getElementById('alertModal');
    if (overlay) overlay.classList.remove('open');
}

function showMessage(text, isError = true) {
    const overlay = ensureAlertModal();
    const titleEl = document.getElementById('alertModalTitle');
    const textEl = document.getElementById('alertModalText');
    const okBtn = document.getElementById('alertModalOkBtn');

    if (isError) {
        titleEl.textContent = 'Ошибка';
        titleEl.className = 'alert-modal-title is-error';
        okBtn.className = 'danger';
    } else {
        titleEl.textContent = 'Сообщение';
        titleEl.className = 'alert-modal-title is-success';
        okBtn.className = 'success';
    }

    textEl.textContent = text || (isError ? 'Произошла неизвестная ошибка' : 'Операция выполнена');
    overlay.classList.add('open');
    setTimeout(() => okBtn.focus(), 30);
}

async function parseApiError(res, fallbackPrefix = 'Ошибка') {
    let rawText = '';
    try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json') || ct.includes('application/problem+json')) {
            const data = await res.json();
            if (typeof data === 'string') {
                rawText = data;
            } else if (data.errors) {
                rawText = Object.values(data.errors).flat().join('; ');
            } else {
                rawText = data.detail || data.message || data.title || '';
            }
        } else {
            rawText = await res.text();
        }
    } catch (_) { }

    const clean = (rawText || '').replace(/^"|"$/g, '').trim();

    const standardTitles = [
        'bad request',
        'unauthorized',
        'forbidden',
        'not found',
        'conflict',
        'one or more validation errors occurred.'
    ];

    if (clean && !standardTitles.includes(clean.toLowerCase())) {
        return clean;
    }

    if (res.status === 401) return 'Сессия истекла или вы не авторизованы. Войдите снова';
    if (res.status === 403) return 'У вас нет прав для выполнения этого действия';
    if (res.status === 404) return 'Запрашиваемый объект не найден';
    if (res.status === 409) return 'Такая запись уже существует';
    if (res.status === 429) return 'Слишком много запросов. Пожалуйста, подождите немного';
    if (res.status >= 500) return 'Ошибка сервера. Попробуйте позже';

    return `${fallbackPrefix} (код ${res.status})`;
}

function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }
function clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
}

function getCurrentUserId() {
    const v = localStorage.getItem('userId');
    return v != null ? parseInt(v, 10) : null;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleString('ru-RU');
}

function truncate(text, max = 120) {
    if (text == null) return '';
    const s = String(text);
    return s.length > max ? s.slice(0, max) + '…' : s;
}

async function withBtnLock(button, func) {
    if (!button) return await func();
    if (button.disabled || button.dataset.busy === '1') return;
    button.dataset.busy = '1';
    button.disabled = true;
    try {
        return await func();
    } finally {
        delete button.dataset.busy;
        button.disabled = false;
    }
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64).split('').map(c =>
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join('')
        );
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

function getSubforumRoles() {
    const token = getToken();
    if (!token) return [];
    const payload = parseJwt(token);
    if (!payload) return [];

    let roles = payload['SubforumRole'];
    if (!roles) return [];
    if (typeof roles === 'string') roles = [roles];
    return roles;
}

function isGlobalAdmin() {
    return getSubforumRoles().includes('global:Admin');
}

function canModerateSubforum(subforumId) {
    if (subforumId == null) return false;
    const roles = getSubforumRoles();
    if (roles.includes('global:Admin')) return true;
    return roles.includes(subforumId + ':Moderator');
}

function getModeratedSubforumIds() {
    return getSubforumRoles()
        .filter(r => r.endsWith(':Moderator'))
        .map(r => parseInt(r.split(':')[0], 10))
        .filter(id => !isNaN(id));
}

function renderRoleBadges() {
    const el = document.getElementById('roleBadges');
    if (!el) return;
    const roles = getSubforumRoles();
    if (roles.includes('global:Admin')) {
        el.innerHTML = '<span class="inline-badge">Администратор</span>';
        return;
    }
    const moderatorOf = getModeratedSubforumIds();
    if (moderatorOf.length > 0) {
        const names = moderatorOf.map(id => subforumName(id) || ('#' + id));
        el.innerHTML = '<span class="inline-badge">Модератор: ' +
            escapeHtml(names.join(', ')) + '</span>';
    } else {
        el.innerHTML = '';
    }
}

function openOwnProfile() {
    const id = getCurrentUserId();
    if (id == null) {
        showMessage('Войдите, чтобы открыть профиль');
        return;
    }
    window.location.href = '?profile=' + id;
}

function goBackToForum() {
    if (document.referrer && document.referrer.includes(window.location.host) && !document.referrer.includes('profile=')) {
        window.history.back();
    } else {
        window.location.href = window.location.pathname;
    }
}

function showLogin() {
    hideAllSections();
    document.getElementById('loginSection').className = 'section';
    const topbarRight = document.getElementById('topbarRight');
    const topbarCenter = document.getElementById('topbarCenter');
    if (topbarRight) topbarRight.style.display = 'none';
    if (topbarCenter) topbarCenter.style.display = 'none';
}

function showRegister() {
    hideAllSections();
    document.getElementById('registerSection').className = 'section';
    const topbarRight = document.getElementById('topbarRight');
    const topbarCenter = document.getElementById('topbarCenter');
    if (topbarRight) topbarRight.style.display = 'none';
    if (topbarCenter) topbarCenter.style.display = 'none';
}

async function showApp() {
    hideAllSections();
    document.getElementById('appSection').className = 'section';
    const topbarRight = document.getElementById('topbarRight');
    const topbarCenter = document.getElementById('topbarCenter');
    if (topbarRight) topbarRight.style.display = 'flex';
    if (topbarCenter) topbarCenter.style.display = 'flex';
    document.getElementById('currentUser').textContent = localStorage.getItem('username') || '—';

    document.getElementById('adminToolsBtn').style.display = isGlobalAdmin() ? 'block' : 'none';

    const isMod = getModeratedSubforumIds().length > 0;
    document.getElementById('moderatorToolsBtn').style.display = (isMod && !isGlobalAdmin()) ? 'inline-flex' : 'none';

    await updateBanStatus();
    await ensureTagsLoaded();
    await loadSubforums();
    await loadVotes();
    renderRoleBadges();
    updateNavUI();
    loadNotifications();
    if (isShowingUsers) {
        await loadUsersList();
    } else {
        await loadPosts();
    }

    document.getElementById('appSection').className = 'section';
}

function showPostDetailSection() {
    hideAllSections();
    document.getElementById('postDetailSection').className = 'section';
}

function showProfileSection() {
    hideAllSections();
    document.getElementById('profileSection').className = 'section';
}

function toggleCreatePostForm() {
    const form = document.getElementById('createPostForm');
    const arrow = document.getElementById('createPostArrow');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        form.style.display = 'none';
        arrow.textContent = '▼';
    }
}

function showConfirm(message, onConfirm, title = 'Подтверждение', yesText = 'Удалить') {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmYesBtn').textContent = yesText;
    const yesBtn = document.getElementById('confirmYesBtn');
    yesBtn.disabled = false;
    delete yesBtn.dataset.busy;
    pendingConfirmAction = onConfirm;
    document.getElementById('confirmModal').classList.add('open');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('open');
    pendingConfirmAction = null;
}

async function confirmYes() {
    const action = pendingConfirmAction;
    closeConfirmModal();
    if (typeof action === 'function') {
        await action();
    }
}

function openAdminToolsModal() {
    if (!isGlobalAdmin()) return;
    document.getElementById('adminToolsModal').classList.add('open');
    switchAdminTab('users');
}

function closeAdminToolsModal() {
    document.getElementById('adminToolsModal').classList.remove('open');
}

function hideAllSections() {
    ['loginSection', 'registerSection', 'appSection',
     'postDetailSection', 'profileSection']
        .forEach(id => document.getElementById(id).className = 'section hidden');

    const loading = document.getElementById('loadingSection');
    if (loading) {
        loading.classList.add('hidden');
    }
}

function formatLastActivity(dateStr) {
    if (!dateStr) return '—';

    const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    const lastUtcTime = new Date(utcStr).getTime();
    if (isNaN(lastUtcTime)) return '—';

    const diffMinutes = (Date.now() - lastUtcTime) / (1000 * 60);

    if (diffMinutes < 5) {
        return '<span style="color: #10b981; font-weight: 700;">● Онлайн</span>';
    }

    return escapeHtml(formatDate(dateStr) || '—');
}


function renderExpandableText(text, limit) {
    const str = text == null ? '' : String(text);
    if (str.length <= limit) {
        return escapeHtml(str);
    }
    const shortPart = escapeHtml(str.slice(0, limit)) + '…';
    const fullPart = escapeHtml(str);
    return `<span class="expandable-short">${shortPart}</span>` +
           `<span class="expandable-full" style="display: none;">${fullPart}</span>` +
           `<button type="button" class="read-more-btn" onclick="toggleExpandText(this, event)">Далее...</button>`;
}

function toggleExpandText(btn, event) {
    if (event) event.stopPropagation();
    const parent = btn.parentElement;
    const shortEl = parent.querySelector('.expandable-short');
    const fullEl = parent.querySelector('.expandable-full');
    if (!shortEl || !fullEl) return;

    const isExpanded = fullEl.style.display !== 'none';
    if (isExpanded) {
        fullEl.style.display = 'none';
        shortEl.style.display = 'inline';
        btn.textContent = 'Далее...';
    } else {
        shortEl.style.display = 'none';
        fullEl.style.display = 'inline';
        btn.textContent = 'Свернуть';
    }
}

function attachCharCounter(el, maxLen) {
    if (!el) return;
    el.maxLength = maxLen;
    if (el.value.length > maxLen) {
        el.value = el.value.slice(0, maxLen);
    }

    let counter = el.nextElementSibling;
    if (!counter || !counter.classList.contains('char-counter')) {
        counter = document.createElement('div');
        counter.className = 'char-counter';
        el.insertAdjacentElement('afterend', counter);
    }

    const update = () => {
        const len = el.value.length;
        counter.textContent = `${len} / ${maxLen}`;
        counter.classList.toggle('limit-reached', len >= maxLen);
    };

    if (!el.dataset.hasCharCounter) {
        el.addEventListener('input', update);
        el.dataset.hasCharCounter = '1';
    }
    update();
}
