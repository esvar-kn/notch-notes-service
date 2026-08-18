import './NoteCard.css';

export const NoteCard = ({
  note,
  onView,
  onDelete,
  isStarred = false,
  isArchived = false,
  onToggleStar,
  onToggleArchive,
}) => {
  if (!note) return null;

  const title = note.title || 'Untitled Note';
  const contentExcerpt =
    note.content?.length > 120 ? `${note.content.substring(0, 120)}...` : note.content || '';
  const dateFormatted = note.updatedAt
    ? new Date(note.updatedAt).toLocaleDateString()
    : 'Recent';

  return (
    <div className={`note-card ${isStarred ? 'note-card-starred' : ''} ${isArchived ? 'note-card-archived' : ''}`}>
      <div className="note-card-header">
        <div className="note-card-title-row">
          <h3>{title}</h3>
          {onToggleStar && (
            <button
              type="button"
              className={`btn-star ${isStarred ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar(note.id);
              }}
              title={isStarred ? 'Unstar Note' : 'Star Note'}
            >
              {isStarred ? '★' : '☆'}
            </button>
          )}
        </div>
        <p className="note-card-excerpt">{contentExcerpt}</p>
      </div>
      <div className="note-card-footer">
        <span>{dateFormatted}</span>
        <div className="note-card-actions">
          {onToggleArchive && (
            <button
              type="button"
              className="btn-card-action"
              onClick={(e) => {
                e.stopPropagation();
                onToggleArchive(note.id);
              }}
            >
              {isArchived ? 'Unarchive' : 'Archive'}
            </button>
          )}
          {onView && (
            <button type="button" className="btn-card-action" onClick={onView}>
              View / Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="btn-card-action btn-card-delete"
              onClick={onDelete}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteCard;
