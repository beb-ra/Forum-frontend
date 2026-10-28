// Закрытие модалок по Esc
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeConfirmModal();
        closeRolesModal();
        closeBanModal();
	closeEmailModal();
        closePasswordModal();
	closeAdminToolsModal();
    }
});

// Точка входа
(async function init() {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    const profileId = params.get('profile');
    const subforumParam = params.get('subforum');
    const myPostsParam = params.get('my-posts');
    const searchParam = params.get('search');

    if (getToken()) {
        try {
            const res = await fetch(`${API_URL}/api/users/me`, {
                headers: { 'Authorization': 'Bearer ' + getToken() }
            });
            if (res.status === 401 || res.status === 404) {
                clearToken();
            }
        } catch (e) {
            console.warn("Сервер недоступен, проверка токена пропущена");
        }
    }

    await ensureTagsLoaded();

    if (profileId) {
        await loadSubforums();
        showProfilePage(parseInt(profileId, 10));
        return;
    }

    if (postId) {
        await loadSubforums();
        showPostDetail(postId);
        return;
    }
    
    if (myPostsParam) {
        isShowingMyPosts = true;
    }
    if (subforumParam) {
        currentSubforumId = parseInt(subforumParam, 10);
    }

    if (searchParam) {
        currentSearchQuery = searchParam;
        setTimeout(() => {
            const searchInput = document.getElementById('globalSearchInput');
            if (searchInput) searchInput.value = searchParam;
        }, 100);
    }

    if (getToken()) {
        showApp();
    } else {
        showLogin();
    }
})();

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});

document.getElementById('globalSearchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        triggerSearch();
    }
});

document.getElementById('globalSearchInput').addEventListener('input', function (e) {
    if (this.value.trim() === '' && currentSearchQuery !== '') {
        currentSearchQuery = '';
        triggerSearch();
    }
});