import { useState } from 'react';

/**
 * CreateNoteModal — Presentational + form-scoped state component.
 * Owns its own form data and submission state.
 * Communicates results upward via onCreated / onClose callbacks.
 */
export const CreateNoteModal = ({ onCreated, onClose, createNote }) => {
  const [formData, setFormData] = useState({ title: '', content: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = formData.title.trim();
    const content = formData.content.trim();

    if (!title || !content) {
      setError('Both title and content are required.');
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
      setIsSubmitting(true);
      setError(null);
      const res = await createNote(formData);
      const createdNote = res.data || res.note || res;
      onCreated(createdNote);
    } catch (err) {
      setError(err.message || 'Failed to create note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({ title: '', content: '' });
    setError(null);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Create New Note</h3>
        </div>

        {error && <div className="note-detail-error">{error}</div>}

        <form onSubmit={handleSubmit} className="note-edit-form">
          <div className="note-edit-group">
            <label htmlFor="create-title">Title</label>
            <input
              id="create-title"
              type="text"
              name="title"
              placeholder="Note Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="note-edit-input"
              required
            />
          </div>

          <div className="note-edit-group">
            <label htmlFor="create-content">Content</label>
            <textarea
              id="create-content"
              name="content"
              placeholder="Write your note content here..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="note-edit-textarea"
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-detail-cancel"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-detail-save"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNoteModal;
