// Закрытие модалок по Esc
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeCreateSubforumModal();
        closeConfirmModal();
        closeRolesModal();
        closeBanModal();
    }
});

// Точка входа
(async function init() {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    const profileId = params.get('profile');

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

    if (getToken()) {
        showApp();
    } else {
        showLogin();
    }
})();