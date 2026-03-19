import { useState, useEffect, Fragment } from 'react';
import {
  History, FileText, Clock, CheckCircle2, AlertTriangle, Loader2, Search,
  Folder, Plus, MoreVertical, Edit2, Trash2, CheckSquare, Square, MessageSquare, X, List
} from 'lucide-react';
import { Menu, Dialog, Transition } from '@headlessui/react';
import { getDocumentHistory, getFolders, createFolder, updateFolder, deleteFolder, assignDocumentToFolder } from '../api';
import MultiChatView from './MultiChatView';
import { useLanguage } from '../LanguageContext';

export default function HistoryPage({ onOpenDocument }) {
  const { t } = useLanguage();
  const [docs, setDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Selection
  const [search, setSearch] = useState('');
  const [activeFolderId, setActiveFolderId] = useState('all'); // 'all', 'unfiled', or folder_id
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [showMultiChat, setShowMultiChat] = useState(false);

  // Folder Modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null); // null = create, object = edit
  const [folderForm, setFolderForm] = useState({ name: '', color: '#3b82f6' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fetchedDocs, fetchedFolders] = await Promise.all([
        getDocumentHistory(),
        getFolders()
      ]);
      setDocs(fetchedDocs || []);
      setFolders(fetchedFolders || []);
      // Cache for offline access
      try {
        localStorage.setItem('notemind_history_cache', JSON.stringify(fetchedDocs || []));
        localStorage.setItem('notemind_folders_cache', JSON.stringify(fetchedFolders || []));
        localStorage.setItem('notemind_history_cache_time', new Date().toISOString());
      } catch (e) { /* localStorage full or unavailable */ }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Document Filtering ──
  const isExpired = (doc) => !!doc.deleted_at;

  const filteredDocs = docs.filter(doc => {
    if (activeFolderId === 'unfiled') {
      if (doc.folder_id) return false;
    } else if (activeFolderId !== 'all') {
      if (doc.folder_id !== activeFolderId) return false;
    }

    if (search) {
      return (doc.original_name || '').toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  // ── Document Actions ──
  const toggleSelection = (e, docId) => {
    e.stopPropagation();
    const newSelection = new Set(selectedDocs);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedDocs(newSelection);
  };

  const assignFolder = async (docId, folderId) => {
    try {
      await assignDocumentToFolder(docId, folderId);
      // Update local state
      setDocs(docs.map(doc => doc.id === docId ? { ...doc, folder_id: folderId } : doc));
    } catch (e) {
      console.error(e);
      alert(t('history.moveFolderError'));
    }
  };

  // ── Folder Actions ──
  const saveFolder = async (e) => {
    e.preventDefault();
    try {
      if (editingFolder) {
        const updated = await updateFolder(editingFolder.id, folderForm.name, folderForm.color);
        setFolders(folders.map(f => f.id === updated.id ? updated : f));
      } else {
        const created = await createFolder(folderForm.name, folderForm.color);
        setFolders([created, ...folders]);
      }
      setIsFolderModalOpen(false);
    } catch (err) {
      alert(`${t('history.saveFolderError')}: ${err.message}`);
    }
  };

  const removeFolder = async (folderId) => {
    if (!confirm(t('history.deleteFolderConfirm'))) return;
    try {
      await deleteFolder(folderId);
      setFolders(folders.filter(f => f.id !== folderId));
      setDocs(docs.map(d => d.folder_id === folderId ? { ...d, folder_id: null } : d));
      if (activeFolderId === folderId) setActiveFolderId('all');
    } catch (err) {
      alert(`${t('history.deleteError')}: ${err.message}`);
    }
  };

  // ── UI Helpers ──
  const statusIcon = (doc) => {
    if (isExpired(doc)) return <Clock size={14} className="text-muted/60" />;
    if (doc.status === 'ready') return <CheckCircle2 size={14} className="text-emerald-400" />;
    if (doc.status === 'error') return <AlertTriangle size={14} className="text-red-400" />;
    return <Loader2 size={14} className="text-yellow-400 animate-spin" />;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 h-[calc(100vh-80px)] overflow-hidden flex flex-col md:flex-row gap-6">

      {/* ── LEFT SIDEBAR (Folders) ── */}
      <div className="w-full md:w-64 flex flex-col gap-4 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-bold text-muted uppercase tracking-widest">{t('history.library')}</h2>
        </div>

        <div className="space-y-1">
          {/* All Docs */}
          <button
            onClick={() => setActiveFolderId('all')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeFolderId === 'all' ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' : 'text-muted hover:bg-surface-2 hover:text-txt'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <History size={16} />
              <span>{t('history.allDocuments')}</span>
            </div>
            <span className="text-xs opacity-70 bg-black/15 px-2 py-0.5 rounded-md">{docs.length}</span>
          </button>

          {/* Unfiled Docs */}
          <button
            onClick={() => setActiveFolderId('unfiled')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeFolderId === 'unfiled' ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' : 'text-muted hover:bg-surface-2 hover:text-txt'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <List size={16} />
              <span>{t('history.uncategorized')}</span>
            </div>
            <span className="text-xs opacity-70 bg-black/15 px-2 py-0.5 rounded-md">
              {docs.filter(d => !d.folder_id).length}
            </span>
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between mb-2 group">
          <h2 className="text-xs font-bold text-muted uppercase tracking-widest">{t('history.folders')}</h2>
          <button
            onClick={() => { setEditingFolder(null); setFolderForm({ name: '', color: '#3b82f6' }); setIsFolderModalOpen(true); }}
            className="p-1 rounded bg-surface-2 hover:bg-primary-600 text-muted hover:text-txt transition-all"
            title={t('history.addFolder')}
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="space-y-1">
          {folders.map(folder => {
            const count = docs.filter(d => d.folder_id === folder.id).length;
            const isActive = activeFolderId === folder.id;
            return (
              <div key={folder.id} className="relative group">
                <button
                  onClick={() => setActiveFolderId(folder.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? 'bg-surface-2 border border-line text-txt shadow-sm' : 'text-muted hover:bg-surface hover:text-txt'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-6">
                    <Folder size={16} style={{ color: folder.color }} className="shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </div>
                  <span className="text-xs opacity-60 bg-black/20 px-2 rounded-md shrink-0">{count}</span>
                </button>

                {/* Folder Context Menu */}
                <Menu as="div" className="absolute right-9 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Menu.Button className="p-1 rounded-md hover:bg-line focus:outline-none">
                    <MoreVertical size={14} className="text-muted" />
                  </Menu.Button>
                  <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                    <Menu.Items className="absolute right-0 mt-2 w-36 origin-top-right rounded-xl bg-surface border border-line shadow-lg shadow-black/50 focus:outline-none z-50 overflow-hidden">
                      <div className="py-1">
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingFolder(folder); setFolderForm({ name: folder.name, color: folder.color }); setIsFolderModalOpen(true); }}
                              className={`${active ? 'bg-line text-txt' : 'text-muted'} group flex w-full items-center px-4 py-2 text-xs transition-colors`}
                            >
                              <Edit2 size={12} className="mr-2" /> {t('history.update')}
                            </button>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={(e) => { e.stopPropagation(); removeFolder(folder.id); }}
                              className={`${active ? 'bg-red-500/10 text-red-500' : 'text-red-400'} group flex w-full items-center px-4 py-2 text-xs transition-colors`}
                            >
                              <Trash2 size={12} className="mr-2" /> {t('history.deleteFolder')}
                            </button>
                          )}
                        </Menu.Item>
                      </div>
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>
            );
          })}
          {folders.length === 0 && !loading && (
            <div className="text-xs text-muted italic text-center py-4">{t('history.noFolders')}</div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT (Documents or MultiChat) ── */}
      {showMultiChat ? (
        <div className="flex-1 overflow-hidden relative">
          <MultiChatView
            selectedDocs={docs.filter(d => selectedDocs.has(d.id))}
            onBack={() => setShowMultiChat(false)}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-surface border border-line rounded-2xl overflow-hidden relative shadow-lg shadow-black/20">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-line bg-surface z-10 shrink-0">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('history.searchPlaceholder')}
                className="w-full bg-bg border border-line rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary-500/50 text-txt"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  setSelectedDocs(new Set());
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors border ${selectionMode ? 'bg-primary-600 border-primary-500 text-white shadow-lg shadow-primary-600/20' : 'bg-bg border-line text-muted hover:text-txt hover:border-line'
                  }`}
              >
                <CheckSquare size={16} />
                <span className="hidden sm:inline">{t('history.selectMultiple')}</span>
              </button>
            </div>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={32} className="text-primary-400 animate-spin" />
              </div>
            ) : filteredDocs.length > 0 ? (
              <div className="space-y-2 pb-20">
                {filteredDocs.map((doc) => {
                  const expired = isExpired(doc);
                  const isSelected = selectedDocs.has(doc.id);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        if (selectionMode) {
                          toggleSelection({ stopPropagation: () => { } }, doc.id);
                        } else {
                          onOpenDocument?.(doc);
                        }
                      }}
                      className={`flex items-center gap-4 rounded-xl px-5 py-4 transition-all border cursor-pointer group ${selectionMode && isSelected
                        ? 'bg-primary-600/10 border-primary-500/40 shadow-inner'
                        : expired
                          ? 'bg-bg/50 border-line/50 opacity-60 hover:opacity-80'
                          : 'bg-surface-2/40 border-line/50 hover:border-primary-500/30 hover:bg-surface-2 hover:shadow-md hover:shadow-black/5'
                        }`}
                    >
                      {/* Checkbox for selection mode */}
                      {selectionMode && (
                        <div className="shrink-0 mr-1" onClick={(e) => toggleSelection(e, doc.id)}>
                          {isSelected ? <CheckSquare size={18} className="text-primary-400" /> : <Square size={18} className="text-muted/60 group-hover:text-muted" />}
                        </div>
                      )}

                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${expired ? 'bg-surface border border-line' : 'bg-primary-600/10 border border-primary-500/15'
                        }`}>
                        <FileText size={18} className={expired ? 'text-muted/60' : 'text-primary-400'} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium truncate ${expired ? 'text-muted/60 line-through' : 'text-txt group-hover:text-primary-400'}`}>
                            {doc.original_name || t('history.untitledDocument')}
                          </p>
                          {!expired && doc.folder_id && folders.find(f => f.id === doc.folder_id) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 shrink-0"
                              style={{ borderColor: folders.find(f => f.id === doc.folder_id).color + '40', color: folders.find(f => f.id === doc.folder_id).color }}
                            >
                              <Folder size={10} />
                              {folders.find(f => f.id === doc.folder_id).name}
                            </span>
                          )}
                          {expired && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium shrink-0">{t('history.expired')}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5">
                          <span className={`flex items-center gap-1 text-[11px] ${expired ? 'text-muted/60' : 'text-muted'}`}>
                            {statusIcon(doc)}
                            {doc.status === 'ready' ? t('history.statusReady') : doc.status === 'error' ? t('history.statusError') : t('history.statusProcessing')}
                          </span>
                          {doc.text_length > 0 && (
                            <span className="text-[11px] text-muted/60">{t('history.charactersCount', { count: `${(doc.text_length / 1000).toFixed(1)}k` })}</span>
                          )}
                          <span className="text-[11px] text-muted/60 flex items-center gap-1">
                            <Clock size={11} />
                            {formatDate(doc.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Action Menu (Move to Folder) - Only show if not in selection mode */}
                      {!selectionMode && !expired && (
                        <Menu as="div" className="relative shrink-0" onClick={e => e.stopPropagation()}>
                          <Menu.Button className="p-2 rounded-lg text-muted hover:text-txt hover:bg-line focus:outline-none transition-colors">
                            <MoreVertical size={16} />
                          </Menu.Button>
                          <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                            <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-surface border border-line shadow-xl shadow-black/50 overflow-hidden z-50 focus:outline-none">
                              <div className="px-3 py-2.5 border-b border-line bg-surface-2/50">
                                <span className="text-[10px] uppercase font-bold text-muted tracking-wider">{t('history.moveToFolder')}</span>
                              </div>
                              <div className="py-1 max-h-48 overflow-y-auto">
                                <Menu.Item>
                                  {({ active }) => (
                                    <button
                                      onClick={() => assignFolder(doc.id, null)}
                                      className={`${active ? 'bg-line text-txt' : 'text-muted'} flex w-full items-center px-4 py-2 text-xs transition-colors gap-2`}
                                    >
                                      <List size={14} className="opacity-70" />
                                      {t('history.removeCategory')}
                                    </button>
                                  )}
                                </Menu.Item>
                                {folders.map(folder => (
                                  <Menu.Item key={folder.id}>
                                    {({ active }) => (
                                      <button
                                        onClick={() => assignFolder(doc.id, folder.id)}
                                        className={`${active ? 'bg-line text-txt' : 'text-muted'} flex w-full items-center px-4 py-2 text-xs transition-colors gap-2 truncate`}
                                      >
                                        <Folder size={14} style={{ color: folder.color }} />
                                        {folder.name}
                                      </button>
                                    )}
                                  </Menu.Item>
                                ))}
                              </div>
                            </Menu.Items>
                          </Transition>
                        </Menu>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Folder size={48} className="text-line mb-4" />
                <p className="text-muted font-medium">{t('history.noDocuments')}</p>
                <p className="text-muted/60 text-sm mt-1">{t('history.noDocumentsDesc')}</p>
              </div>
            )}
          </div>

          {/* Multi-select Action Bar */}
          <Transition
            show={selectionMode && selectedDocs.size > 0}
            enter="transition-transform duration-300"
            enterFrom="translate-y-full"
            enterTo="translate-y-0"
            leave="transition-transform duration-300"
            leaveFrom="translate-y-0"
            leaveTo="translate-y-full"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20"
          >
            <div className="bg-surface-2 border border-primary-500/30 rounded-full shadow-2xl shadow-primary-500/10 px-6 py-3 flex items-center gap-6">
              <span className="text-sm font-medium text-txt">{t('history.selectedCount', { count: selectedDocs.size })}</span>
              <div className="w-px h-6 bg-surface-2" />
              <button
                onClick={() => setShowMultiChat(true)}
                className="flex items-center gap-2 bg-primary-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-600/30 transition-all"
              >
                <MessageSquare size={16} />
                {t('history.chatWithAi')}
              </button>
            </div>
          </Transition>
        </div>
      )}

      {/* ── FOLDER MODAL ── */}
      <Transition appear show={isFolderModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setIsFolderModalOpen(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-surface border border-line p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-bold leading-6 text-txt mb-4">
                    {editingFolder ? t('history.editFolder') : t('history.newFolder')}
                  </Dialog.Title>

                  <form onSubmit={saveFolder} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">{t('history.folderName')}</label>
                      <input
                        type="text"
                        required
                        value={folderForm.name}
                        onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                        className="w-full bg-bg border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500/50 text-txt"
                        placeholder={t('history.folderPlaceholder')}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">{t('history.folderColor')}</label>
                      <div className="flex flex-wrap gap-2">
                        {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'].map(color => (
                          <div
                            key={color}
                            onClick={() => setFolderForm({ ...folderForm, color })}
                            className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-all ${folderForm.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-medium text-muted bg-surface-2 hover:bg-line rounded-xl transition-colors"
                        onClick={() => setIsFolderModalOpen(false)}
                      >
                        {t('history.cancel')}
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-xl transition-colors shadow-lg shadow-primary-600/20"
                      >
                        {editingFolder ? t('history.update') : t('history.createNew')}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

    </div>
  );
}
