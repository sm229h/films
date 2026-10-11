import { useParams } from 'react-router-dom';
import { catalogApi } from '../lib/api.js';
import { useAsync, useDocumentMeta } from '../hooks/index.js';
import { ContentCard } from '../components/media.jsx';
import { EmptyState, ErrorState, PosterSkeleton } from '../components/ui.jsx';
import { toFaDigits } from '../lib/format.js';

export default function PersonPage() {
  const { id } = useParams();
  const data = useAsync(() => catalogApi.person(id), [id]);

  const person = data.data?.person;
  const credits = data.data?.credits ?? [];

  useDocumentMeta({
    title: person ? person.name_fa || person.name_en : 'صفحه عوامل',
    description: person ? `آثار ${person.name_en}` : undefined,
    type: 'profile',
  });

  if (data.error) {
    return (
      <div className="container page">
        <ErrorState error={data.error} onRetry={data.reload} />
      </div>
    );
  }

  return (
    <div className="container page">
      <header className="page-head">
        <div className="row-between" style={{ gap: 'var(--space-4)' }}>
          <div className="cast__photo" style={{ width: 96, height: 96 }}>
            {person?.photo_url ? <img src={person.photo_url} alt="" /> : null}
          </div>
          <div>
            <h1 className="page-title">{person?.name_fa || person?.name_en || '…'}</h1>
            <p className="page-subtitle ltr">{person?.name_en}</p>
            {person?.birth_year ? (
              <p className="dim">سال تولد: {toFaDigits(person.birth_year)}</p>
            ) : null}
          </div>
        </div>
      </header>

      <h2 className="detail__section-title">آثار مرتبط</h2>

      {data.loading ? (
        <div className="grid-cards" style={{ marginTop: 'var(--space-4)' }}>
          {Array.from({ length: 6 }, (_, index) => (
            <PosterSkeleton key={index} />
          ))}
        </div>
      ) : credits.length ? (
        <div className="grid-cards" style={{ marginTop: 'var(--space-4)' }}>
          {credits.map((item) => (
            <ContentCard key={`${item.kind}-${item.id}`} content={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="users"
          title="اثری برای این شخص ثبت نشده است"
          description="برای این فرد هنوز اثری در سامانه ثبت نشده است."
        />
      )}
    </div>
  );
}
