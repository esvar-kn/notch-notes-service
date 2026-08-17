import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notesService } from '../services/notesService';
import { NoteCard } from '../components/NoteCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { CreateNoteModal } from '../components/CreateNoteModal';
import './NotesListPage.css';

export const NotesListPage = () => {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(6);
  const [totalPages, setTotalPages] = useState(1);

  // Create Note Modal visibility
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchNotes = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await notesService.getNotes({ page, limit });
        if (isMounted) {
          const notesData = res.notes || res.data || (Array.isArray(res) ? res : []);
          setNotes(notesData);
          const total = res.totalCount ?? res.count ?? notesData.length;
          setTotalPages(res.totalPages || Math.ceil(total / limit) || 1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch notes.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchNotes();

    return () => {
      isMounted = false;
    };
  }, [page, limit]);

  const handleNoteCreated = (createdNote) => {
    setNotes([createdNote, ...notes]);
    setIsCreating(false);
  };

  const handleDeleteNote = async (e, noteId) => {
    e.stopPropagation();
    try {
      setError(null);
      await notesService.deleteNote(noteId);
      setNotes((prevNotes) => prevNotes.filter((n) => n.id !== noteId));
    } catch (err) {
      setError(err.message || 'Failed to delete note.');
    }
  };

  const filteredNotes = notes.filter(
    (note) =>
      note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="notes-list-page">
      <header className="notes-page-header">
        <div className="notes-page-title">
          <h2>My Notes</h2>
          <p>Organize, search, and manage your personal notes</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="btn-create-note"
        >
          + New Note
        </button>
      </header>

      <div className="notes-controls-bar">
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search notes by title or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="note-detail-error">{error}</div>}

      {loading ? (
        <div className="notes-grid">
          {[...Array(6)].map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="note-card notes-empty-card">
          <p className="notes-muted-text">
            {searchQuery ? 'No notes matching your search.' : 'No notes found. Click "+ New Note" to create your first note!'}
          </p>
        </div>
      ) : (
        <>
          <div className="notes-grid">
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onView={() => navigate(`/notes/${note.id}`)}
                onDelete={(e) => handleDeleteNote(e, note.id)}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="notes-pagination">
            <button
              type="button"
              className="btn-pagination"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn-pagination"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={page >= totalPages || notes.length < limit}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {/* Create Note Modal — self-contained component */}
      {isCreating && (
        <CreateNoteModal
          createNote={notesService.createNote}
          onCreated={handleNoteCreated}
          onClose={() => setIsCreating(false)}
        />
      )}
    </div>
  );
};

export default NotesListPage;
