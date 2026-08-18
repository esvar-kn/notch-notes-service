import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notesService } from '../services/notesService';

/**
 * CreateNoteModal Component using TanStack React Query `useMutation`.
 * On successful creation, invalidates the ['notes'] query key so that
 * NotesListPage automatically refetches server state without prop-drilled refetch calls.
 */
export const CreateNoteModal = ({ onClose }) => {
  const [formData, setFormData] = useState({ title: '', content: '' });
  const [validationError, setValidationError] = useState(null);

  const queryClient = useQueryClient();

  const createNoteMutation = useMutation({
    mutationFn: (newNoteData) => notesService.createNote(newNoteData),
    onSuccess: () => {
      // Invalidate server state query key ['notes'] so all notes queries auto-refetch
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      if (onClose) onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const title = formData.title.trim();
    const content = formData.content.trim();

    if (!title || !content) {
      setValidationError('Both title and content are required.');
      return;
    }

    if (title.length < 3) {
      setValidationError('Title must be at least 3 characters long.');
      return;
    }

    if (title.length > 200) {
      setValidationError('Title cannot exceed 200 characters.');
      return;
    }

    if (content.length > 10000) {
      setValidationError('Content cannot exceed 10,000 characters.');
      return;
    }

    setValidationError(null);
    createNoteMutation.mutate({ title, content });
  };

  const handleCancel = () => {
    setFormData({ title: '', content: '' });
    setValidationError(null);
    if (onClose) onClose();
  };

  const errorMsg = validationError || (createNoteMutation.error?.message ?? null);

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Create New Note</h3>
        </div>

        {errorMsg && <div className="note-detail-error">{errorMsg}</div>}

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
              disabled={createNoteMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-detail-save"
              disabled={createNoteMutation.isPending}
            >
              {createNoteMutation.isPending ? 'Creating...' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNoteModal;
