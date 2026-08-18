import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { setFilter, toggleStarNote, toggleArchiveNote } from '../store/uiSlice';
import { notesService } from '../services/notesService';
import { NoteCard } from '../components/NoteCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { CreateNoteModal } from '../components/CreateNoteModal';
import './NotesListPage.css';

export const NotesListPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  // Redux Client UI State (filter, starred, archived)
  const activeFilter = useSelector((state) => state.ui.filter);
  const starredNoteIds = useSelector((state) => state.ui.starredNoteIds);
  const archivedNoteIds = useSelector((state) => state.ui.archivedNoteIds);

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(6);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Note Modal visibility
  const [isCreating, setIsCreating] = useState(false);

  // Server State via TanStack React Query (useQuery replaces manual useEffect/useState)
  const {
    data: notesResponse,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['notes', page, limit],
    queryFn: () => notesService.getNotes({ page, limit }),
  });

  // Server Mutation for Deleting Note
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId) => notesService.deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const handleDeleteNote = (e, noteId) => {
    e.stopPropagation();
    deleteNoteMutation.mutate(noteId);
  };

  // Safely extract notes list and total pages from server response
  const notes =
    notesResponse?.notes ||
    notesResponse?.data ||
    (Array.isArray(notesResponse) ? notesResponse : []);

  const totalCount = notesResponse?.totalCount ?? notesResponse?.count ?? notes.length;
  const totalPages = notesResponse?.totalPages || Math.ceil(totalCount / limit) || 1;

  // Filter notes based on Search Query + Redux UI Filter State
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const isStarred = starredNoteIds.includes(note.id);
    const isArchived = archivedNoteIds.includes(note.id);

    if (activeFilter === 'starred') return isStarred;
    if (activeFilter === 'archived') return isArchived;
    return !isArchived;
  });

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

        {/* Redux UI Filter Tabs */}
        <div className="filter-tabs">
          <button
            type="button"
            className={`btn-filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => dispatch(setFilter('all'))}
          >
            All Notes
          </button>
          <button
            type="button"
            className={`btn-filter-tab ${activeFilter === 'starred' ? 'active' : ''}`}
            onClick={() => dispatch(setFilter('starred'))}
          >
            ★ Starred ({starredNoteIds.length})
          </button>
          <button
            type="button"
            className={`btn-filter-tab ${activeFilter === 'archived' ? 'active' : ''}`}
            onClick={() => dispatch(setFilter('archived'))}
          >
            📁 Archived ({archivedNoteIds.length})
          </button>
        </div>
      </div>

      {(isError || deleteNoteMutation.isError) && (
        <div className="note-detail-error">
          {error?.message || deleteNoteMutation.error?.message || 'Error communicating with notes server.'}
        </div>
      )}

      {isLoading ? (
        <div className="notes-grid">
          {[...Array(6)].map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="note-card notes-empty-card">
          <p className="notes-muted-text">
            {searchQuery
              ? 'No notes matching your search.'
              : activeFilter === 'starred'
              ? 'No starred notes yet. Click the star icon on any note to star it!'
              : activeFilter === 'archived'
              ? 'No archived notes.'
              : 'No notes found. Click "+ New Note" to create your first note!'}
          </p>
        </div>
      ) : (
        <>
          <div className="notes-grid">
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isStarred={starredNoteIds.includes(note.id)}
                isArchived={archivedNoteIds.includes(note.id)}
                onToggleStar={(id) => dispatch(toggleStarNote(id))}
                onToggleArchive={(id) => dispatch(toggleArchiveNote(id))}
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

      {/* Create Note Modal */}
      {isCreating && (
        <CreateNoteModal onClose={() => setIsCreating(false)} />
      )}
    </div>
  );
};

export default NotesListPage;
