const API_URL = 'https://forum-6sgl.onrender.com';

        // состояние
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

        // отложенное действие для confirm-модалки
        let pendingConfirmAction = null;

        // кэш списка ролей (Admin/Moderator с их id)
        let rolesList = [];

        // какой профиль сейчас редактируется в модалке полномочий
        let currentRolesProfileId = null;

        // какой профиль сейчас баним
        let currentBanProfileId = null;

        // утилиты
        function showMessage(text, isError = true) {
            const el = document.getElementById('message');
            el.className = isError ? 'error' : 'success';
            el.textContent = text;
            setTimeout(() => { el.textContent = ''; }, 4000);
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

        // JWT и роли
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

        // навигация
        function openOwnProfile() {
            const id = getCurrentUserId();
            if (id == null) {
                showMessage('Войдите, чтобы открыть профиль');
                return;
            }
            window.location.href = '?profile=' + id;
        }

        function goBackToForum() {
            window.location.href = window.location.pathname;
        }

        // UI
        function showLogin() {
            hideAllSections();
            document.getElementById('loginSection').className = 'section';
        }

        function showRegister() {
            hideAllSections();
            document.getElementById('registerSection').className = 'section';
        }

        async function showApp() {
            document.getElementById('appSection').className = 'section';
            document.getElementById('currentUser').textContent = localStorage.getItem('username') || '—';

            document.getElementById('createSubforumBlock').style.display =
                isGlobalAdmin() ? 'block' : 'none';

            await ensureTagsLoaded();
            await loadSubforums();
            await loadVotes();
            renderRoleBadges();
            await loadPosts();

            hideAllSections();
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

	// модальное окно создания подфорума
        function openCreateSubforumModal() {
            if (!isGlobalAdmin()) {
                showMessage('Только администратор может создавать подфорумы');
                return;
            }
            document.getElementById('createSubforumModal').classList.add('open');
            document.getElementById('subforumName').value = '';
            document.getElementById('subforumDesc').value = '';
            setTimeout(() => document.getElementById('subforumName').focus(), 50);
        }

        function closeCreateSubforumModal() {
            document.getElementById('createSubforumModal').classList.remove('open');
        }

        // универсальное подтверждение
        function showConfirm(message, onConfirm, title = 'Подтверждение', yesText = 'Удалить') {
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            document.getElementById('confirmYesBtn').textContent = yesText;
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

	function hideAllSections() {
    ['loginSection', 'registerSection', 'appSection',
     'postDetailSection', 'profileSection', 'loadingSection']
        .forEach(id => document.getElementById(id).className = 'section hidden');
	}