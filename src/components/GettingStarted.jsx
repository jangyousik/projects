/* oxlint-disable react/only-export-components */
export const SAMPLE_TRIP = {
  title: '하노이 3박 4일 알찬 여행',
  destination: '베트남 · 하노이',
  startDate: '2026-09-10',
  endDate: '2026-09-13',
  people: 4,
  currency: 'VND',
  days: [
    {
      date: '2026-09-10',
      label: '1일차 · 도착과 야경',
      items: [
        { time: '14:00', title: '노이바이 공항 도착', place: 'Noi Bai International Airport', memo: '유심 수령 후 그랩 호출', cost: 350000, category: 'transport' },
        { time: '17:00', title: '호텔 체크인', place: '호안끼엠 구시가지', memo: '짐을 풀고 잠시 휴식', cost: 0, category: 'accommodation' },
        { time: '19:00', title: '분짜 저녁식사', place: 'Bun Cha Dac Kim', memo: '대표 메뉴와 네 개의 스프링롤', cost: 480000, category: 'food' },
        { time: '20:30', title: '호안끼엠 호수 야경 산책', place: 'Hoan Kiem Lake', memo: '성 요셉 성당까지 가볍게 걷기', cost: 0, category: 'activity' },
      ],
    },
    {
      date: '2026-09-11',
      label: '2일차 · 하노이 핵심',
      items: [
        { time: '09:00', title: '호치민 묘소와 주석궁', place: 'Ho Chi Minh Mausoleum', memo: '노출을 피해 오전에 관람', cost: 0, category: 'activity' },
        { time: '11:00', title: '문묘 관람', place: 'Temple of Literature', memo: '베트남 최초의 대학교', cost: 280000, category: 'activity' },
        { time: '14:00', title: '카페 지앙 에그커피', place: 'Cafe Giang', memo: '시그니처 에그커피 맛보기', cost: 180000, category: 'food' },
        { time: '18:30', title: '탕롱 수상인형극', place: 'Thang Long Water Puppet Theatre', memo: '인기 회차는 미리 예약', cost: 800000, category: 'activity' },
      ],
    },
    {
      date: '2026-09-12',
      label: '3일차 · 교외 투어',
      items: [
        { time: '08:00', title: '닌빈 일일 투어 출발', place: 'Ninh Binh', memo: '항무아·탐콕·무아 케이브 코스', cost: 3200000, category: 'activity' },
        { time: '19:30', title: '마사지와 휴식', place: '호안끼엠 구시가지', memo: '투어 후 피로 풀기', cost: 1200000, category: 'activity' },
      ],
    },
    {
      date: '2026-09-13',
      label: '4일차 · 쇼핑과 귀국',
      items: [
        { time: '09:30', title: '동쑤 시장 쇼핑', place: 'Dong Xuan Market', memo: '커피와 간단한 기념품 구입', cost: 1000000, category: 'shopping' },
        { time: '13:00', title: '포 마지막 점심', place: 'Pho 10 Ly Quoc Su', memo: '공항 이동 전 식사', cost: 400000, category: 'food' },
        { time: '16:00', title: '공항으로 이동', place: 'Noi Bai International Airport', memo: '국제선 출발 3시간 전 도착', cost: 350000, category: 'transport' },
      ],
    },
  ],
}

export function GettingStarted({ mode, session, copying, onBack, onShowDemo, onCopy, onLogin }) {
  if (mode === 'guide') {
    const steps = [
      ['1', '로그인하기', '구글 또는 이메일로 내 여행 공간을 만들어요.'],
      ['2', '여행 만들기', '도시, 날짜, 인원과 기본 통화를 입력해요.'],
      ['3', '일정 채우기', '장소, 시간, 예산과 예약 정보를 날짜별로 저장해요.'],
      ['4', '함께 쓰기', '동행자를 초대하고 편집 또는 보기 권한을 설정해요.'],
      ['5', '여행 중 활용하기', '지도, 알림, 지출과 사진을 한 곳에서 관리해요.'],
    ]
    return <section className="start-page" aria-labelledby="guide-title">
      <button className="start-back" type="button" onClick={onBack}>← 홈으로</button>
      <div className="start-hero"><span>🧭</span><div><p>3분이면 충분해요</p><h2 id="guide-title">여행온 시작 가이드</h2><small>계획부터 추억 정리까지 순서대로 해보세요.</small></div></div>
      <div className="guide-steps">{steps.map(([number, title, text]) => <article key={number}><b>{number}</b><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      <button className="start-primary" type="button" onClick={onShowDemo}>완성된 샘플 여행 보기</button>
    </section>
  }

  const total = SAMPLE_TRIP.days.flatMap((day) => day.items).reduce((sum, item) => sum + item.cost, 0)
  return <section className="start-page sample-page" aria-labelledby="sample-title">
    <button className="start-back" type="button" onClick={onBack}>← 홈으로</button>
    <div className="sample-cover">
      <span className="sample-public">🌐 모두에게 공개된 샘플</span>
      <div><p>{SAMPLE_TRIP.destination}</p><h2 id="sample-title">{SAMPLE_TRIP.title}</h2><small>{SAMPLE_TRIP.startDate} ~ {SAMPLE_TRIP.endDate} · {SAMPLE_TRIP.people}명</small></div>
      <div className="sample-summary"><span><small>일정</small><strong>4일</strong></span><span><small>장소</small><strong>{SAMPLE_TRIP.days.flatMap((day) => day.items).length}개</strong></span><span><small>예상 경비</small><strong>{total.toLocaleString('ko-KR')} VND</strong></span></div>
    </div>
    <p className="sample-notice">실제 사용자의 개인정보가 없는 읽기 전용 예시입니다. 지도 링크는 새 창에서 열립니다.</p>
    <div className="sample-days">{SAMPLE_TRIP.days.map((day) => <article className="sample-day" key={day.date}><header><time>{day.date.slice(5).replace('-', '.')}</time><h3>{day.label}</h3></header><div>{day.items.map((item) => <div className="sample-item" key={`${day.date}-${item.time}-${item.title}`}><time>{item.time}</time><span><strong>{item.title}</strong><small>📍 {item.place}</small><em>{item.memo}</em></span><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.place}, ${SAMPLE_TRIP.destination}`)}`} target="_blank" rel="noreferrer" aria-label={`${item.place} 지도 보기`}>지도</a></div>)}</div></article>)}</div>
    {session
      ? <button className="start-primary" type="button" onClick={onCopy} disabled={copying}>{copying ? '내 여행으로 복사 중…' : '이 일정을 내 여행으로 복사'}</button>
      : <button className="start-primary" type="button" onClick={onLogin}>로그인하고 이 일정 복사하기</button>}
  </section>
}
