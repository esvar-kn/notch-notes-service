import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesService } from '../services/notesService';
import { SkeletonDetail } from '../components/SkeletonCard';
import { NoteEditForm } from '../components/NoteEditForm';
import './NoteDetailPage.css';

export const NoteDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // React Query useQuery for single note detail
  const {
    data: noteResponse,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['note', id],
    queryFn: () => notesService.getNoteById(id),
    enabled: Boolean(id),
  });

  const note = noteResponse?.note || noteResponse?.data || noteResponse;

  // React Query useMutation for Update
  const updateNoteMutation = useMutation({
    mutationFn: (formData) => notesService.updateNote(id, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note', id] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setIsEditing(false);
    },
  });

  // React Query useMutation for Delete
  const deleteNoteMutation = useMutation({
    mutationFn: () => notesService.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      navigate('/notes');
    },
  });

  const handleSave = async (formData) => {
    updateNoteMutation.mutate(formData);
  };

  const handleDelete = () => {
    deleteNoteMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="note-detail-page">
        <button type="button" onClick={() => navigate('/notes')} className="btn-back-nav">
          ← Back to Notes
        </button>
        <SkeletonDetail />
      </div>
    );
  }

  if (isError && !note) {
    return (
      <div className="note-detail-page">
        <button type="button" onClick={() => navigate(-1)} className="btn-back-nav">
          ← Back
        </button>
        <div className="note-detail-card">
          <div className="note-detail-error">{error?.message || 'Failed to fetch note details.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="note-detail-page">
      <button type="button" onClick={() => navigate('/notes')} className="btn-back-nav">
        ← Back to Notes
      </button>

      <div className="note-detail-card">
        {(updateNoteMutation.isError || deleteNoteMutation.isError) && (
          <div className="note-detail-error">
            {updateNoteMutation.error?.message || deleteNoteMutation.error?.message || 'Operation failed.'}
          </div>
        )}

        {isEditing ? (
          <NoteEditForm
            initialData={{ title: note?.title || '', content: note?.content || '' }}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <header className="note-detail-header">
              <h1>{note?.title}</h1>
              <div className="note-detail-meta">
                {note?.createdAt && (
                  <span>Created: {new Date(note.createdAt).toLocaleDateString()}</span>
                )}
                {note?.updatedAt && (
                  <>
                    <span>•</span>
                    <span>Updated: {new Date(note.updatedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </header>

            <article className="note-detail-body">
              {note?.content}
            </article>

            <footer className="note-detail-actions">
              <button
                type="button"
                className="btn-detail-edit"
                onClick={() => setIsEditing(true)}
              >
                Edit Note
              </button>
              <button
                type="button"
                className="btn-detail-delete"
                onClick={handleDelete}
                disabled={deleteNoteMutation.isPending}
              >
                {deleteNoteMutation.isPending ? 'Deleting...' : 'Delete Note'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default NoteDetailPage;
