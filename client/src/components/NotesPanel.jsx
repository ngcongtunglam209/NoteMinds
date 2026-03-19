import { useState, useEffect } from 'react';
import { StickyNote, Plus, Trash2, Edit3, Check, X, Loader2, Palette } from 'lucide-react';
import { getDocumentNotes, createNote, updateNote, deleteNote } from '../api';
import { useLanguage } from '../LanguageContext';

const NOTE_COLORS = [
  { value: '#fbbf24', label: 'Vàng' },
  { value: '#34d399', label: 'Xanh lá' },
  { value: '#60a5fa', label: 'Xanh dương' },
  { value: '#f472b6', label: 'Hồng' },
  { value: '#a78bfa', label: 'Tím' },
  { value: '#fb923c', label: 'Cam' },
];

export default function NotesPanel({ docId, isOpen, onClose }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [newColor, setNewColor] = useState('#fbbf24');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#fbbf24');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && docId) {
      fetchNotes();
    }
  }, [isOpen, docId]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const data = await getDocumentNotes(docId);
      setNotes(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newContent.trim() || saving) return;
    setSaving(true);
    try {
      const note = await createNote(docId, newContent.trim(), newColor);
      setNotes(prev => [note, ...prev]);
      setNewContent('');
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleUpdate = async (id) => {
    if (!editContent.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await updateNote(id, editContent.trim(), editColor);
      setNotes(prev => prev.map(n => n.id === id ? updated : n));
      setEditingId(null);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ }
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditColor(note.color || '#fbbf24');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-surface border-l border-line shadow-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
              <StickyNote size={16} className="text-amber-400" />
            </div>
            <h3 className="font-semibold text-sm">{t('notes.personalNotes')}</h3>
            <span className="px-2 py-0.5 bg-surface-2 rounded-md text-xs text-muted">{notes.length}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Add new note */}
        <div className="px-5 py-4 border-b border-line">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t('notes.placeholder')}
            rows={3}
            className="w-full bg-bg border border-line rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-primary-500/50 transition-colors placeholder:text-muted/50"
          />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1.5">
              <Palette size={13} className="text-muted mr-1" />
              {NOTE_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setNewColor(c.value)}
                  className={`w-5 h-5 rounded-full transition-all ${newColor === c.value ? 'ring-2 ring-offset-2 ring-offset-surface scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c.value, ringColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
            <button
              onClick={handleCreate}
              disabled={!newContent.trim() || saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Thêm
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-primary-400" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-10 text-muted">
              <StickyNote size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t('notes.noNotes')}</p>
              <p className="text-xs mt-1">{t('notes.noNotesDesc')}</p>
            </div>
          ) : (
            notes.map(note => (
              <div
                key={note.id}
                className="bg-bg border border-line rounded-xl p-4 group hover:border-primary-500/30 transition-all"
              >
                {editingId === note.id ? (
                  <>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary-500/50"
                      autoFocus
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        {NOTE_COLORS.map(c => (
                          <button
                            key={c.value}
                            onClick={() => setEditColor(c.value)}
                            className={`w-4 h-4 rounded-full transition-all ${editColor === c.value ? 'ring-2 ring-offset-1 ring-offset-bg scale-110' : ''}`}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleUpdate(note.id)} className="p-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 transition-colors">
                          <Check size={12} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-surface-2 hover:bg-line transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="w-1 self-stretch rounded-full mt-0.5 shrink-0" style={{ backgroundColor: note.color || '#fbbf24' }} />
                      <p className="text-sm flex-1 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-line/50">
                      <span className="text-[11px] text-muted">
                        {new Date(note.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(note)} className="p-1 rounded hover:bg-surface-2 text-muted hover:text-txt transition-colors">
                          <Edit3 size={12} />
                        </button>
                        <button onClick={() => handleDelete(note.id)} className="p-1 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
