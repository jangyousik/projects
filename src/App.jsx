import { useEffect, useState } from 'react'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { TripCard } from './components/TripCard'
import { AuthPanel } from './components/AuthPanel'
import { upcomingTrip } from './data/trips'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const readStored = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function App() {
  const [dialog, setDialog] = useState(null)
  const [trips, setTrips] = useState(() => readStored('travel-app-trips'))
  const [places, setPlaces] = useState(() => readStored('travel-app-places'))
  const [schedules, setSchedules] = useState(() => readStored('travel-app-schedules'))
  const [session, setSession] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  const saveTrip = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = [...trips, {
      id: crypto.randomUUID(),
      destination: form.get('destination'),
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      people: Number(form.get('people')),
    }]
    localStorage.setItem('travel-app-trips', JSON.stringify(next))
    setTrips(next)
    setDialog(null)
  }

  const savePlace = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = [...places, {
      id: crypto.randomUUID(),
      name: form.get('name'),
      memo: form.get('memo'),
    }]
    localStorage.setItem('travel-app-places', JSON.stringify(next))
    setPlaces(next)
    setDialog(null)
  }

  const saveSchedule = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = [...schedules, {
      id: crypto.randomUUID(),
      title: form.get('title'),
      date: form.get('date'),
      time: form.get('time'),
      place: form.get('place'),
      memo: form.get('memo'),
    }].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    localStorage.setItem('travel-app-schedules', JSON.stringify(next))
    setSchedules(next)
    setDialog(null)
  }

  return (
    <div className="app-shell">
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">안녕하세요 👋</p>
            <h1>어디로 떠나볼까요?</h1>
          </div>
          <button className="profile-button" type="button" aria-label="로그인과 내 프로필" onClick={() => setDialog('auth')}>{session ? (session.user.user_metadata?.name?.slice(0, 2) || 'MY') : '로그인'}</button>
        </header>

        <section className="hero-copy" aria-labelledby="next-trip-title">
          <div><p className="section-label">다가오는 여행</p><h2 id="next-trip-title">설레는 순간을 한곳에</h2></div>
          <a className="text-button" href="/hanoi-trip.html">일정 열기</a>
        </section>

        <TripCard trip={upcomingTrip} />

        <section className="quick-section" aria-labelledby="quick-title">
          <div className="section-heading"><div><p className="section-label">빠른 메뉴</p><h2 id="quick-title">여행 준비하기</h2></div></div>
          <div className="quick-grid">
            <button className="quick-card" type="button" onClick={() => setDialog('schedule')}>
              <span className="quick-icon" aria-hidden="true">🗓️</span><strong>일정 만들기</strong><span>새로운 날짜별 일정을 추가해요</span>
            </button>
            <button className="quick-card" type="button" onClick={() => setDialog('place')}>
              <span className="quick-icon" aria-hidden="true">📍</span><strong>장소 저장</strong><span>가고 싶은 곳을 모아둬요</span>
            </button>
          </div>
        </section>

        {places.length > 0 && (
          <section className="saved-section">
            <p className="section-label">저장한 장소</p>
            <div className="saved-list">{places.map((place) => (
              <a key={place.id} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, Hanoi`)}`} target="_blank" rel="noreferrer">
                <span>📍</span><span><strong>{place.name}</strong><small>{place.memo || 'Google Maps에서 보기'}</small></span><b>›</b>
              </a>
            ))}</div>
          </section>
        )}

        {schedules.length > 0 && (
          <section className="saved-section">
            <p className="section-label">내가 만든 일정</p>
            <div className="saved-list">{schedules.map((schedule) => (
              <div className="saved-trip schedule-row" key={schedule.id}>
                <span className="schedule-date"><strong>{new Date(`${schedule.date}T00:00:00`).getDate()}</strong><small>{schedule.time}</small></span>
                <span><strong>{schedule.title}</strong><small>{schedule.place || schedule.memo || '세부 내용 없음'}</small></span>
              </div>
            ))}</div>
          </section>
        )}

        {trips.length > 0 && (
          <section className="saved-section">
            <p className="section-label">내가 만든 여행</p>
            <div className="saved-list">{trips.map((trip) => (
              <div className="saved-trip" key={trip.id}><span>✈️</span><span><strong>{trip.destination}</strong><small>{trip.startDate} ~ {trip.endDate} · {trip.people}명</small></span></div>
            ))}</div>
          </section>
        )}

        <button className="new-trip-button" type="button" onClick={() => setDialog('trip')}><span aria-hidden="true">＋</span> 새 여행 만들기</button>
      </main>

      <BottomNav />

      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-handle" />
            <div className="dialog-heading"><div><p className="section-label">{dialog === 'auth' ? '여행온 계정' : '새로운 기록'}</p><h2 id="dialog-title">{dialog === 'trip' ? '새 여행 만들기' : dialog === 'schedule' ? '새 일정 만들기' : dialog === 'auth' ? '로그인' : '장소 저장'}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="닫기">×</button></div>
            {dialog === 'auth' ? (
              <AuthPanel session={session} onClose={() => setDialog(null)} />
            ) : dialog === 'trip' ? (
              <form onSubmit={saveTrip}>
                <label>여행지<input name="destination" required placeholder="예: 도쿄" /></label>
                <div className="form-row"><label>출발일<input name="startDate" type="date" required /></label><label>도착일<input name="endDate" type="date" required /></label></div>
                <label>인원<input name="people" type="number" inputMode="numeric" min="1" defaultValue="1" required /></label>
                <button className="dialog-submit" type="submit">여행 저장</button>
              </form>
            ) : dialog === 'schedule' ? (
              <form onSubmit={saveSchedule}>
                <label>일정 이름<input name="title" required placeholder="예: 공항으로 출발" /></label>
                <div className="form-row"><label>날짜<input name="date" type="date" required /></label><label>시간<input name="time" type="time" required /></label></div>
                <label>장소<input name="place" placeholder="예: 인천국제공항" /></label>
                <label>메모<textarea name="memo" maxLength="300" placeholder="준비물이나 세부 내용을 기록하세요" /></label>
                <button className="dialog-submit" type="submit">일정 저장</button>
              </form>
            ) : (
              <form onSubmit={savePlace}>
                <label>장소 이름<input name="name" required placeholder="예: Train Street" /></label>
                <label>메모<textarea name="memo" maxLength="200" placeholder="먹고 싶은 메뉴나 방문 이유" /></label>
                <button className="dialog-submit" type="submit">장소 저장</button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
