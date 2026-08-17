import './SkeletonCard.css';

export const SkeletonCard = () => {
  return (
    <div className="skeleton-card">
      <div>
        <div className="skeleton skeleton-title"></div>
        <div className="skeleton skeleton-line"></div>
        <div className="skeleton skeleton-line short"></div>
      </div>
      <div className="skeleton-footer">
        <div className="skeleton skeleton-date"></div>
        <div className="skeleton skeleton-button"></div>
      </div>
    </div>
  );
};

export const SkeletonDetail = () => {
  return (
    <div className="skeleton-detail-card">
      <div className="skeleton skeleton-detail-title"></div>
      <div className="skeleton skeleton-detail-meta"></div>
      <div className="skeleton-detail-paragraph">
        <div className="skeleton skeleton-line"></div>
        <div className="skeleton skeleton-line"></div>
        <div className="skeleton skeleton-line"></div>
        <div className="skeleton skeleton-line short"></div>
      </div>
    </div>
  );
};

export const LoadingSpinner = () => {
  return (
    <div className="spinner-container">
      <div className="spinner" role="status" aria-label="Loading"></div>
    </div>
  );
};

export default SkeletonCard;
