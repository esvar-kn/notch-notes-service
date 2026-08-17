import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { notesService } from '../services/notesService';
import { SkeletonDetail } from '../components/SkeletonCard';
import { NoteEditForm } from '../components/NoteEditForm';
import './NoteDetailPage.css';

export const NoteDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch single note by URL param on component mount or id change
  useEffect(() => {
    let isMounted = true;

    const fetchNote = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await notesService.getNoteById(id);
        if (isMounted) {
          const noteData = res.note || res.data || res;
          setNote(noteData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch note details.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (id) {
      fetchNote();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Handle Note Update — delegate to NoteEditForm, receive result
  const handleSave = async (formData) => {
    const res = await notesService.updateNote(id, formData);
    const updatedNoteData = res.updatedNote || res.data || formData;
    setNote((prevNote) => ({
      ...prevNote,
      ...updatedNoteData,
    }));
    setIsEditing(false);
    setError(null);
  };

  // Handle Note Deletion (DELETE /api/v1/notes/:id)
  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await notesService.deleteNote(id);
      navigate('/notes');
    } catch (err) {
      setError(err.message || 'Failed to delete note.');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="note-detail-page">
        <button type="button" onClick={() => navigate('/notes')} className="btn-back-nav">
          ← Back to Notes
        </button>
        <SkeletonDetail />
      </div>
    );
  }

  if (error && !note) {
    return (
      <div className="note-detail-page">
        <button type="button" onClick={() => navigate(-1)} className="btn-back-nav">
          ← Back
        </button>
        <div className="note-detail-card">
          <div className="note-detail-error">{error}</div>
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
        {error && <div className="note-detail-error">{error}</div>}

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
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Note'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default NoteDetailPage;
