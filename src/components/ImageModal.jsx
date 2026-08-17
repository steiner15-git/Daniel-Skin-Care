export default function ImageModal({ src, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" aria-label="סגירה" onClick={onClose}>
          ×
        </button>
        {src ? (
          <img className="modal__img" src={src} alt="" />
        ) : (
          <div className="muted" style={{ padding: 24 }}>
            טוען…
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
