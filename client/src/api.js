import axios from 'axios';

// Determine API base URL based on environment
export const getApiBaseUrl = () => {
  const envApiUrl = import.meta.env.VITE_API_URL;
  if (typeof envApiUrl === 'string' && envApiUrl.trim()) {
    return envApiUrl.trim();
  }

  // Local development - use /api prefix
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/api';
  }

  // Production: use api subdomain (nginx will add /api prefix internally)
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // Extract main domain (handles www.domain.com -> api.domain.com)
  const mainDomain = hostname.replace(/^www\./, '');

  return `${protocol}//api.${mainDomain}`;
};

const API_BASE = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes for AI processing
  withCredentials: true, // Enable credentials for CORS
});

// ── Token management ──────────────────────────────────

const TOKEN_KEY = 'notemind_token';
const USER_KEY = 'notemind_user';
const LANGUAGE_KEY = 'notemind-language';

function getCurrentLanguage() {
  try {
    const lang = localStorage.getItem(LANGUAGE_KEY);
    if (lang === 'vi' || lang === 'en') return lang;
  } catch {
    // ignore
  }
  const browserLang = navigator.language || navigator.userLanguage || '';
  return browserLang.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Attach token to every request automatically and encrypt if needed
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Helper to recursively fix SQLite UTC dates in API responses
function fixDates(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Match SQLite datetime: YYYY-MM-DD HH:MM:SS
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(obj)) {
      return obj.replace(' ', 'T') + 'Z';
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = fixDates(obj[i]);
    }
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      obj[key] = fixDates(obj[key]);
    }
  }
  return obj;
}

// Decrypt responses and fix dates
api.interceptors.response.use(
  (response) => {
    // Fix SQLite UTC date strings
    if (response.data) {
      response.data = fixDates(response.data);
    }

    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ── Auth API ──────────────────────────────────────────

export async function register(username, email, password, displayName, turnstileToken) {
  const response = await api.post('/auth/register', { username, email, password, displayName, turnstileToken });
  const { token, user } = response.data;
  storeAuth(token, user);
  return { token, user };
}

export async function login(loginVal, password, turnstileToken) {
  const response = await api.post('/auth/login', { login: loginVal, password, turnstileToken });
  const data = response.data;

  // If 2FA is required, return the flag + temp token without storing auth
  if (data.requires2FA) {
    return {
      requires2FA: true,
      tempToken: data.tempToken,
      totpEnabled: data.totpEnabled,
      passkeyEnabled: data.passkeyEnabled,
    };
  }

  const { token, user } = data;
  storeAuth(token, user);
  return { token, user };
}

export async function getMe() {
  const response = await api.get('/auth/me');
  return response.data.user;
}

export async function sendPresenceHeartbeat() {
  const response = await api.post('/auth/presence/heartbeat', {});
  return response.data;
}

export function logout() {
  clearAuth();
}

// ── Email Verification & Password Reset ───────────────

export async function verifyEmailToken(token) {
  const response = await api.post('/auth/verify-email', { token });
  if (response.data.user) {
    storeAuth(getStoredToken(), response.data.user);
  }
  return response.data;
}

export async function resendVerification(email) {
  const response = await api.post('/auth/resend-verification', { email });
  return response.data;
}

export async function forgotPassword(email, turnstileToken) {
  const response = await api.post('/auth/forgot-password', { email, turnstileToken });
  return response.data;
}

export async function resetPassword(token, newPassword) {
  const response = await api.post('/auth/reset-password', { token, newPassword });
  return response.data;
}

// ── 2FA API ────────────────────────────────────────

export async function verify2FA(tempToken, totpCode) {
  const response = await api.post('/auth/2fa/verify', { tempToken, totpCode });
  const { token, user } = response.data;
  storeAuth(token, user);
  return { token, user };
}

export async function verify2FARecovery(tempToken, recoveryCode) {
  const response = await api.post('/auth/2fa/recovery', { tempToken, recoveryCode });
  const { token, user } = response.data;
  storeAuth(token, user);
  return { token, user };
}

export async function setup2FA() {
  const response = await api.post('/auth/2fa/setup');
  return response.data;
}

export async function enable2FA(token) {
  const response = await api.post('/auth/2fa/enable', { token });
  return response.data;
}

export async function disable2FA(password) {
  const response = await api.post('/auth/2fa/disable', { password });
  return response.data;
}

export async function get2FAStatus() {
  const response = await api.get('/auth/2fa/status');
  return response.data;
}

export async function regenerateRecoveryCodes(password) {
  const response = await api.post('/auth/2fa/recovery-codes', { password });
  return response.data;
}

// ── Passkey API ───────────────────────────────────────

export async function getPasskeyRegisterOptions() {
  const response = await api.post('/auth/passkey/register-options');
  return response.data;
}

export async function verifyPasskeyRegistration(passkeyResponse, name) {
  const response = await api.post('/auth/passkey/register-verify', { response: passkeyResponse, name });
  return response.data;
}

export async function getPasskeyAuthOptions(tempToken) {
  const response = await api.post('/auth/passkey/auth-options', { tempToken });
  return response.data;
}

export async function verifyPasskeyAuth(tempToken, passkeyResponse) {
  const response = await api.post('/auth/passkey/auth-verify', { tempToken, response: passkeyResponse });
  const { token, user } = response.data;
  storeAuth(token, user);
  return { token, user };
}

// Discoverable passkey login (no username/password needed)
export async function getPasskeyLoginOptions() {
  const response = await api.post('/auth/passkey/login-options');
  return response.data;
}

export async function verifyPasskeyLogin(passkeyResponse) {
  const response = await api.post('/auth/passkey/login-verify', { response: passkeyResponse });
  const { token, user } = response.data;
  storeAuth(token, user);
  return { token, user };
}

export async function getPasskeyList() {
  const response = await api.get('/auth/passkey/list');
  return response.data;
}

export async function deletePasskey(id) {
  const response = await api.delete(`/auth/passkey/${id}`);
  return response.data;
}

export async function renamePasskey(id, name) {
  const response = await api.put(`/auth/passkey/${id}`, { name });
  return response.data;
}

export async function uploadFile(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });

  return response.data;
}

export async function getDocumentStatus(docId) {
  const response = await api.get(`/documents/${docId}/status`);
  return response.data;
}

export async function generateMindmap(docId) {
  const response = await api.post(`/documents/${docId}/mindmap`, { language: getCurrentLanguage() });
  return response.data;
}

export async function generateSummary(docId) {
  const response = await api.post(`/documents/${docId}/summary`, { language: getCurrentLanguage() });
  return response.data;
}

export async function generateFlashcards(docId) {
  const response = await api.post(`/documents/${docId}/flashcards`, { language: getCurrentLanguage() });
  return response.data;
}

export async function getDueFlashcards(docId) {
  const response = await api.get(`/documents/${docId}/flashcards/due`);
  return response.data;
}

export async function reviewFlashcard(docId, cardIdx, difficulty, timeElapsedMs = 0) {
  const response = await api.post(`/documents/${docId}/flashcards/${cardIdx}/review`, {
    difficulty,
    timeElapsedMs
  });
  return response.data;
}

export async function generateQuiz(docId) {
  const response = await api.post(`/documents/${docId}/quiz`, { language: getCurrentLanguage() });
  return response.data;
}

export async function downloadDocument(docId) {
  const response = await api.get(`/documents/${docId}/download`, {
    responseType: 'blob',
  });

  // Extract filename from Content-Disposition header if available
  const contentDisposition = response.headers['content-disposition'];
  let filename = 'document.txt'; // fallback
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch && filenameMatch.length === 2) {
      filename = filenameMatch[1];
    }
  }

  return { blob: response.data, filename };
}

export async function chatWithDocument(docId, message, history) {
  const response = await api.post(`/documents/${docId}/chat`, {
    message,
    history,
    language: getCurrentLanguage(),
  });
  return response.data;
}

export async function healthCheck() {
  const response = await api.get('/health');
  return response.data;
}

export async function getRateLimit() {
  const response = await api.get('/rate-limit');
  return response.data;
}

export async function deleteDocument(docId) {
  const response = await api.delete(`/documents/${docId}`);
  return response.data;
}

export async function getDocumentHistory() {
  const response = await api.get('/documents/history');
  return response.data.documents;
}

export async function getDocumentSessions(docId) {
  const response = await api.get(`/documents/${docId}/sessions`);
  return response.data;
}

export async function chatWithMultipleDocuments(docIds, message, history) {
  const response = await api.post('/chat/multi', {
    docIds,
    message,
    history,
    language: getCurrentLanguage(),
  });
  return response.data;
}

// ── Profile API ───────────────────────────────────────

export async function updateProfile(displayName, email) {
  const body = {};
  if (displayName !== undefined) body.displayName = displayName;
  if (email !== undefined) body.email = email;
  const response = await api.put('/auth/profile', body);
  const { user } = response.data;
  storeAuth(getStoredToken(), user);
  return response.data;
}

export async function updatePresenceStatus(status) {
  const response = await api.put('/auth/presence/status', { status });
  const { user } = response.data;
  if (user) {
    storeAuth(getStoredToken(), user);
  }
  return response.data;
}

export async function updatePlanBadgeVisibility(showPlanBadge) {
  const response = await api.put('/auth/profile', { showPlanBadge });
  const { user } = response.data;
  if (user) {
    storeAuth(getStoredToken(), user);
  }
  return response.data;
}

export async function changePassword(oldPassword, newPassword) {
  const response = await api.put('/auth/password', { oldPassword, newPassword });
  return response.data;
}

// ── Admin API ─────────────────────────────────────────

export async function adminGetUsers() {
  const response = await api.get('/admin/users');
  return response.data.users;
}

export async function adminSetPlan(userId, plan, expiresAt) {
  const response = await api.put(`/admin/users/${userId}/plan`, { plan, expiresAt });
  return response.data.user;
}

export async function adminSetRole(userId, role) {
  const response = await api.put(`/admin/users/${userId}/role`, { role });
  return response.data.user;
}

export async function adminBanUser(userId, reason) {
  const response = await api.put(`/admin/users/${userId}/ban`, { reason });
  return response.data.user;
}

export async function adminUnbanUser(userId) {
  const response = await api.put(`/admin/users/${userId}/unban`);
  return response.data.user;
}

export async function adminGetBannedIps() {
  const response = await api.get('/admin/banned-ips');
  return response.data.ips;
}

export async function adminBanIp(ip, reason) {
  const response = await api.post('/admin/ban-ip', { ip, reason });
  return response.data;
}

export async function adminUnbanIp(ip) {
  const response = await api.delete(`/admin/ban-ip/${ip}`);
  return response.data;
}

export async function adminGetPlans() {
  const response = await api.get('/admin/plans');
  return response.data.plans;
}

// ── Conversations (Chat History) ──────────────────────

export async function getConversations(documentId) {
  const response = await api.get(`/conversations/${documentId}`);
  return response.data.conversations;
}

export async function getConversationHistory(documentId) {
  const response = await api.get(`/conversations/${documentId}/history`);
  return response.data.conversations;
}

export async function getConversationMessages(conversationId) {
  const response = await api.get(`/conversation/${conversationId}`);
  return response.data.messages;
}

export async function saveConversation(documentId, messages, title) {
  const response = await api.post('/conversation/save', { documentId, messages, title });
  return response.data;
}

export async function addMessageToConversation(conversationId, role, message) {
  const response = await api.post(`/conversation/${conversationId}/message`, { role, message });
  return response.data;
}

export async function deleteConversation(conversationId) {
  const response = await api.delete(`/conversation/${conversationId}`);
  return response.data;
}

// ── Favorites ─────────────────────────────────────────

export async function addFavorite(documentId) {
  const response = await api.post(`/favorites/${documentId}`);
  return response.data;
}

export async function removeFavorite(documentId) {
  const response = await api.delete(`/favorites/${documentId}`);
  return response.data;
}

export async function getFavorites() {
  const response = await api.get('/favorites');
  return response.data.favorites;
}

export async function checkFavorite(documentId) {
  const response = await api.get(`/favorites/${documentId}/check`);
  return response.data.isFavorite;
}

// ── Tags ──────────────────────────────────────────────

export async function createTag(name, color) {
  const response = await api.post('/tags', { name, color });
  return response.data;
}

export async function getUserTags() {
  const response = await api.get('/tags');
  return response.data.tags;
}

export async function addTagToDocument(documentId, tagId) {
  const response = await api.post(`/documents/${documentId}/tags/${tagId}`);
  return response.data;
}

export async function removeTagFromDocument(documentId, tagId) {
  const response = await api.delete(`/documents/${documentId}/tags/${tagId}`);
  return response.data;
}

export async function getDocumentTags(documentId) {
  const response = await api.get(`/documents/${documentId}/tags`);
  return response.data.tags;
}

// ── Search ────────────────────────────────────────────

export async function searchDocuments(query, limit = 20) {
  const response = await api.get(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return response.data;
}

export async function searchChat(query) {
  const response = await api.post('/search/chat', { query, language: getCurrentLanguage() });
  return response.data;
}

// ── Community ─────────────────────────────────────────

export async function getCommunityDocuments(page = 1, limit = 20) {
  const response = await api.get(`/community/documents?page=${page}&limit=${limit}`);
  return response.data;
}

export async function getPublicDocumentContent(id) {
  const response = await api.get(`/public/documents/${id}/content`);
  return response.data;
}

export async function toggleDocumentPublic(documentId, is_public) {
  const response = await api.put(`/documents/${documentId}/public`, { is_public });
  return response.data;
}

// ── Analytics ─────────────────────────────────────────

export async function getAnalytics(days = 7) {
  const response = await api.get(`/analytics?days=${days}`);
  return response.data;
}

// ── Folders (Workspaces) ─────────────────────────────────────────

export async function getFolders() {
  const response = await api.get('/folders');
  return response.data.folders;
}

export async function createFolder(name, color) {
  const response = await api.post('/folders', { name, color });
  return response.data;
}

export async function updateFolder(id, name, color) {
  const response = await api.put(`/folders/${id}`, { name, color });
  return response.data;
}

export async function deleteFolder(id) {
  const response = await api.delete(`/folders/${id}`);
  return response.data;
}

export async function assignDocumentToFolder(documentId, folderId) {
  const response = await api.put(`/documents/${documentId}/folder`, { folder_id: folderId });
  return response.data;
}

// ── Sharing ───────────────────────────────────────────

export async function createShareLink(documentId, shareType = 'view', expiresIn = 7) {
  const response = await api.post(`/share/${documentId}`, { shareType, expiresIn });
  return response.data;
}

export async function validateShareToken(token) {
  const response = await api.get(`/shared/${token}`);
  return response.data;
}

export async function getSharedDocumentContent(token) {
  const response = await api.get(`/shared/${token}/content`);
  return response.data;
}

export async function shareGenerateMindmap(token) {
  const response = await api.post(`/shared/${token}/mindmap`, { language: getCurrentLanguage() });
  return response.data;
}

export async function shareGenerateSummary(token) {
  const response = await api.post(`/shared/${token}/summary`, { language: getCurrentLanguage() });
  return response.data;
}

export async function shareGenerateFlashcards(token) {
  const response = await api.post(`/shared/${token}/flashcards`, { language: getCurrentLanguage() });
  return response.data;
}

export async function shareChatWithDocument(token, message, history) {
  const response = await api.post(`/shared/${token}/chat`, {
    message,
    history,
    language: getCurrentLanguage(),
  });
  return response.data;
}

export async function getSharedDocuments(documentId = null) {
  const params = documentId ? `?documentId=${documentId}` : '';
  const response = await api.get(`/shares${params}`);
  return response.data.shares;
}

export async function deleteShareLink(shareId) {
  const response = await api.delete(`/shares/${shareId}`);
  return response.data;
}


// ── Spaced Repetition ─────────────────────────────────

export async function getFlashcardStats() {
  const response = await api.get('/flashcards/stats');
  return response.data;
}

// ── Export ─────────────────────────────────────────────

export async function exportFlashcardsCSV(documentId) {
  const response = await api.post(`/export/flashcards/${documentId}`);
  return response.data;
}

export async function exportConversationPDF(conversationId) {
  const response = await api.post(`/export/conversation/${conversationId}`);
  return response.data;
}

// ── User Preferences ──────────────────────────────────

export async function getPreferences() {
  const response = await api.get('/preferences');
  return response.data;
}

export async function setPreference(key, value) {
  const response = await api.put('/preferences', { key, value });
  return response.data;
}

// ── Offline Sync ──────────────────────────────────────

export async function getPendingSyncActions() {
  const response = await api.get('/sync/pending');
  return response.data.pending;
}

export async function queueSyncAction(entityType, entityId, action, data) {
  const response = await api.post('/sync/action', { entityType, entityId, action, data });
  return response.data;
}

export async function markSynced(syncId) {
  const response = await api.post(`/sync/mark/${syncId}`);
  return response.data;
}

// ── Learning Paths (AI Recommendations) ───────────────

// ═══════════════════════════════════════════════════════
// NEW FEATURES API (v2)
// ═══════════════════════════════════════════════════════

// ── Personal Notes ────────────────────────────────────
export async function getDocumentNotes(docId) {
  const response = await api.get(`/documents/${docId}/notes`);
  return response.data.notes;
}
export async function createNote(docId, content, color) {
  const response = await api.post(`/documents/${docId}/notes`, { content, color });
  return response.data.note;
}
export async function updateNote(noteId, content, color) {
  const response = await api.put(`/notes/${noteId}`, { content, color });
  return response.data.note;
}
export async function deleteNote(noteId) {
  const response = await api.delete(`/notes/${noteId}`);
  return response.data;
}

// ── Community Likes ───────────────────────────────────
export async function likeDocument(docId) {
  const response = await api.post(`/community/${docId}/like`);
  return response.data;
}
export async function unlikeDocument(docId) {
  const response = await api.delete(`/community/${docId}/like`);
  return response.data;
}

// ── Community Comments ────────────────────────────────
export async function getComments(docId) {
  const response = await api.get(`/community/${docId}/comments`);
  return response.data.comments;
}
export async function postComment(docId, content) {
  const response = await api.post(`/community/${docId}/comments`, { content });
  return response.data.comment;
}
export async function deleteComment(commentId) {
  const response = await api.delete(`/community/comments/${commentId}`);
  return response.data;
}

// ── Learning Goals + Streaks ──────────────────────────
export async function getGoals() {
  const response = await api.get('/goals');
  return response.data;
}
export async function updateGoals(goals) {
  const response = await api.put('/goals', goals);
  return response.data;
}
export async function trackActivity(type) {
  const response = await api.post('/activity/track', { type });
  return response.data;
}
export async function getActivityHistory(days = 30) {
  const response = await api.get(`/activity/history?days=${days}`);
  return response.data.history;
}

// ── Leaderboard ───────────────────────────────────────
export async function getLeaderboard(period = 'all') {
  const response = await api.get(`/leaderboard?period=${period}`);
  return response.data.leaderboard;
}

// ── Announcements ─────────────────────────────────────
export async function getAnnouncements() {
  const response = await api.get('/announcements');
  return response.data.announcements;
}
export async function createAnnouncement(data) {
  const response = await api.post('/announcements', data);
  return response.data.announcement;
}
export async function updateAnnouncement(id, data) {
  const response = await api.put(`/announcements/${id}`, data);
  return response.data.announcement;
}
export async function deleteAnnouncement(id) {
  const response = await api.delete(`/announcements/${id}`);
  return response.data;
}
export async function markAnnouncementRead(id) {
  const response = await api.post(`/announcements/${id}/read`);
  return response.data;
}

// ── Admin Stats ───────────────────────────────────────
export async function adminGetStats() {
  const response = await api.get('/admin/stats');
  return response.data;
}

// ── Admin Document Management ─────────────────────────
export async function adminGetDocuments(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const response = await api.get(`/admin/documents?${qs}`);
  return response.data;
}
export async function adminDeleteDocument(docId) {
  const response = await api.delete(`/admin/documents/${docId}`);
  return response.data;
}
export async function adminToggleDocPublic(docId) {
  const response = await api.put(`/admin/documents/${docId}/toggle-public`);
  return response.data;
}

// ── Admin Audit Log ───────────────────────────────────
export async function adminGetAuditLogs(page = 1, limit = 50) {
  const response = await api.get(`/admin/audit-logs?page=${page}&limit=${limit}`);
  return response.data;
}

// ── Export Markdown ───────────────────────────────────
export async function exportMarkdown(docId) {
  const response = await api.get(`/export/markdown/${docId}`);
  return response.data;
}

// ── Admin: Real-time Dashboard ────────────────────────
export async function adminGetRealtime() {
  const response = await api.get('/admin/realtime');
  return response.data;
}

// ── Admin: Bulk Actions ───────────────────────────────
export async function adminBulkSetPlan(userIds, plan) {
  const response = await api.post('/admin/bulk/users/plan', { userIds, plan });
  return response.data;
}
export async function adminBulkBanUsers(userIds, reason) {
  const response = await api.post('/admin/bulk/users/ban', { userIds, reason });
  return response.data;
}
export async function adminBulkDeleteDocs(docIds) {
  const response = await api.post('/admin/bulk/docs/delete', { docIds });
  return response.data;
}
export async function adminBulkTogglePublicDocs(docIds, isPublic) {
  const response = await api.post('/admin/bulk/docs/toggle-public', { docIds, is_public: isPublic });
  return response.data;
}

// ── Admin: User Detail ────────────────────────────────
export async function adminGetUserDetail(userId) {
  const response = await api.get(`/admin/users/${userId}`);
  return response.data;
}

// ── Admin: AI Usage Monitoring ────────────────────────
export async function adminGetAiUsage(days = 7) {
  const response = await api.get(`/admin/ai-usage?days=${days}`);
  return response.data;
}

// ── Admin: Content Moderation ─────────────────────────

// ── Public Profile ────────────────────────────────────
export async function getPublicProfile(username) {
  const response = await api.get(`/users/profile/${encodeURIComponent(username)}`);
  return response.data;
}

export async function adminGetReports(status = 'pending', page = 1) {
  const response = await api.get(`/admin/reports?status=${status}&page=${page}`);
  return response.data;
}
export async function submitReport(targetType, targetId, reason, details) {
  const response = await api.post('/community/report', { targetType, targetId, reason, details });
  return response.data;
}
export async function adminReviewReport(reportId, status) {
  const response = await api.put(`/admin/reports/${reportId}`, { status });
  return response.data;
}

// ── Admin: System Health ──────────────────────────────
export async function adminGetSystemHealth() {
  const response = await api.get('/admin/system-health');
  return response.data;
}

// ── Admin: Email Blast ────────────────────────────────
export async function adminSendEmailBlast(subject, content, targetFilter) {
  const response = await api.post('/admin/email-blast', { subject, content, targetFilter });
  return response.data;
}
export async function adminGetEmailBlasts() {
  const response = await api.get('/admin/email-blasts');
  return response.data;
}

// ── Admin: Feature Flags ──────────────────────────────
export async function adminGetFeatureFlags() {
  const response = await api.get('/admin/feature-flags');
  return response.data;
}
export async function adminCreateFeatureFlag(data) {
  const response = await api.post('/admin/feature-flags', data);
  return response.data;
}
export async function adminUpdateFeatureFlag(id, data) {
  const response = await api.put(`/admin/feature-flags/${id}`, data);
  return response.data;
}
export async function adminDeleteFeatureFlag(id) {
  const response = await api.delete(`/admin/feature-flags/${id}`);
  return response.data;
}

// ── Admin: Export CSV ─────────────────────────────────
export async function adminExportUsers() {
  const response = await api.get('/admin/export/users');
  return response.data;
}
export async function adminExportDocuments() {
  const response = await api.get('/admin/export/documents');
  return response.data;
}
export async function adminExportActivity() {
  const response = await api.get('/admin/export/activity');
  return response.data;
}

// ── Admin: Login Activity ─────────────────────────────
export async function adminGetLoginActivity(page = 1) {
  const response = await api.get(`/admin/login-activity?page=${page}`);
  return response.data;
}
export async function trackLogin() {
  try { await api.post('/track-login'); } catch { /* silent */ }
}

// ── System Settings (maintenance etc.) ────────────────
export async function getSystemSettings() {
  const response = await api.get('/system/settings');
  return response.data;
}
export async function adminUpdateSystemSetting(key, value) {
  const response = await api.put('/admin/system-settings', { key, value });
  return response.data;
}

// ── Learning Paths (AI Recommended) ─────────────────────────
export async function generateLearningPath(documentId) {
  const response = await api.post('/learning-paths', {
    documentId,
    language: getCurrentLanguage(),
  });
  return response.data;
}

export async function getLearningPaths() {
  const response = await api.get('/learning-paths');
  return response.data.learningPaths;
}

export async function getLearningPath(id) {
  const response = await api.get(`/learning-paths/${id}`);
  return response.data.learningPath;
}

export async function updateLearningPathProgress(id, stepId, completed) {
  const response = await api.put(`/learning-paths/${id}/progress`, { stepId, completed });
  return response.data;
}

export async function deleteLearningPath(id) {
  const response = await api.delete(`/learning-paths/${id}`);
  return response.data;
}

// ── Admin Notifications ──────────────────────────────

export async function adminGetNotifications(params = {}) {
  const response = await api.get('/admin/notifications', { params });
  return response.data;
}

export async function adminGetNotificationStats() {
  const response = await api.get('/admin/notifications/stats');
  return response.data;
}

export async function adminSendNotification({ userIds, title, message, type, icon, actionUrl }) {
  const response = await api.post('/admin/notifications/send', { userIds, title, message, type, icon, actionUrl });
  return response.data;
}

export async function adminDeleteNotification(id) {
  const response = await api.delete(`/admin/notifications/${id}`);
  return response.data;
}

export async function adminCleanupNotifications(daysOld = 30) {
  const response = await api.post('/admin/notifications/cleanup', { daysOld });
  return response.data;
}

// ── Payment ──

export async function createPaymentOrder(plan) {
  const response = await api.post('/payment/orders', { plan });
  return response.data.order;
}

export async function createCheckoutSession(plan) {
  const response = await api.post('/payment/checkout', { plan });
  return response.data;
}

export async function checkPaymentOrder(orderId) {
  const response = await api.get(`/payment/orders/${orderId}`);
  return response.data.order;
}

export async function getPaymentHistory() {
  const response = await api.get('/payment/history');
  return response.data.history;
}

export async function getPlanPrices() {
  const response = await api.get('/payment/prices');
  return response.data.prices;
}

export async function adminGetPayments(limit = 50) {
  const response = await api.get(`/admin/payments?limit=${limit}`);
  return response.data.payments;
}

export default api;