// רכיבי Skeleton גנריים — מלבן/עיגול עם אנימציית pulse עדינה, בגוון
// --accent-soft בשקיפות נמוכה (עקבי עם פלטת האפליקציה, לא אפור נייטרלי).
// משמש רק במסכי רשימה/רשת עם מבנה קבוע (addendum #8): ClientsList, Series,
// Products, Business (הכנסות/הוצאות), Dashboard ("לו"ז היום"),
// AllPhotos/ClientAlbum. במסכי פריט בודד (ClientCard, טפסי עריכה,
// SeriesPurchase/ProductSell) נשאר "טוען…" הקיים, ללא שינוי.

export default function Skeleton({ className = "", style }) {
  return <div className={"skeleton " + className} style={style} />;
}

// שורת כרטיס-רשימה. itemClassName קובע את צורת הכרטיס החיצוני (list-item /
// fin-item וכו') כדי להתאים לגובה/ריווח האמיתי של המסך המדובר.
export function SkeletonRows({ count = 4, itemClassName = "list-item", lines = 2 }) {
  return (
    <div className="list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={"card " + itemClassName}>
          <div className="list-item__main">
            <Skeleton className="skeleton--title" />
            {lines > 1 && <Skeleton className="skeleton--subtitle" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// רשת ריבועים בצורת .album-thumb — לשימוש ב-AllPhotos/ClientAlbum.
export function SkeletonAlbumGrid({ count = 8 }) {
  return (
    <div className="album-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="album-thumb skeleton" />
      ))}
    </div>
  );
}
