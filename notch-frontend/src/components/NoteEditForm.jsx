import { useState, useRef, useEffect } from 'react';

/**
 * NoteEditForm — Presentational form component for editing a note.
 * Includes debounced keystroke emission for real-time collaborative editing (Block 3).
 *
 * Props:
 *   initialData  — { title, content } to seed the form
 *   onSave       — async (formData) => Promise — called on valid submit
 *   onCancel     — () => void — called when user cancels editing
 *   onEmitUpdate — (formData) => void — called on debounced keystroke for live Socket.io sync
 *   onFocusChange — (isFocused: boolean) => void — tracks focus guard
 */
export const NoteEditForm = ({ initialData, onSave, onCancel, onEmitUpdate, onFocusChange }) => {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    content: initialData?.content || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const debounceTimerRef = useRef(null);

  // Synchronize form if initialData updates remotely while not actively focused
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        title: initialData.title ?? prev.title,
        content: initialData.content ?? prev.content,
      }));
    }
  }, [initialData?.title, initialData?.content]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...formData, [name]: value };
    setFormData(updated);
    if (error) setError(null);

    // Debounced emit on keystroke (300ms debounce to avoid spamming on every keypress)
    if (onEmitUpdate) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        onEmitUpdate(updated);
      }, 300);
    }
  };

  const handleFocus = () => {
    if (onFocusChange) onFocusChange(true);
  };

  const handleBlur = () => {
    if (onFocusChange) onFocusChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = formData.title.trim();
    const content = formData.content.trim();

    if (!title || !content) {
      setError('Title and Content cannot be empty.');
      return;
    }

    if (title.length < 3) {
      setError('Title must be at least 3 characters long.');
      return;
    }

    if (title.length > 200) {
      setError('Title cannot exceed 200 characters.');
      return;
    }

    if (content.length > 10000) {
      setError('Content cannot exceed 10,000 characters.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await onSave(formData);
    } catch (err) {
      setError(err.message || 'Failed to save note.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="note-edit-form">
      {error && <div className="note-detail-error">{error}</div>}

      <div className="note-edit-group">
        <label htmlFor="edit-title">Title</label>
        <input
          id="edit-title"
          type="text"
          name="title"
          value={formData.title}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="note-edit-input"
          required
        />
      </div>

      <div className="note-edit-group">
        <label htmlFor="edit-content">Content</label>
        <textarea
          id="edit-content"
          name="content"
          value={formData.content}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="note-edit-textarea"
          required
        />
      </div>

      <div className="note-detail-actions">
        <button
          type="button"
          className="btn-detail-cancel"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-detail-save" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
};

export default NoteEditForm;
