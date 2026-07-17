export function TripCard({ trip }) {
  return (
    <a className="trip-card" href={trip.href} aria-label={`${trip.title} 상세 일정 보기`}>
      <div className="trip-card__overlay" />
      <div className="trip-card__content">
        <span className="trip-badge">D-{trip.daysLeft}</span>
        <div>
          <p>{trip.country}</p>
          <h3>{trip.title}</h3>
          <div className="trip-meta">
            <span>📅 {trip.date}</span>
            <span>👥 {trip.people}명</span>
          </div>
          {trip.budgetSummary?.length > 0 && (
            <div className="trip-budget" aria-label="여행 예산 요약">
              {trip.budgetSummary.map((item) => (
                <span className="trip-budget__item" key={item.label}>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}
