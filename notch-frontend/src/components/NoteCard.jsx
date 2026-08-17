import './NoteCard.css';

export const NoteCard = ({ note, onView, onDelete }) => {
  if (!note) return null;

  const title = note.title || 'Untitled Note';
  const contentExcerpt =
    note.content?.length > 120 ? `${note.content.substring(0, 120)}...` : note.content || '';
  const dateFormatted = note.updatedAt
    ? new Date(note.updatedAt).toLocaleDateString()
    : 'Recent';

  return (
    <div className="note-card">
      <div className="note-card-header">
        <h3>{title}</h3>
        <p className="note-card-excerpt">{contentExcerpt}</p>
      </div>
      <div className="note-card-footer">
        <span>{dateFormatted}</span>
        <div className="note-card-actions">
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
