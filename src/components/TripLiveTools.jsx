import { useEffect, useMemo, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

const ExternalApps = registerPlugin('ExternalApps')
const fallbackWeather = { temperature: null, apparent: null, rain: null, code: null }

function weatherIcon(code) {
  if (code == null) return '🌤️'
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67 || code >= 80) return '🌧️'
  return '🌤️'
}

export function TripLiveTools({ trip }) {
  const cacheKey = useMemo(() => `trip-live-tools:${trip.destination}`, [trip.destination])
  const cached = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(cacheKey)) || {} } catch { return {} }
  }, [cacheKey])
  const [weather, setWeather] = useState(cached.weather || fallbackWeather)
  const [vndToKrw, setVndToKrw] = useState(cached.vndToKrw || 0.0565)
  const [usdToVnd, setUsdToVnd] = useState(cached.usdToVnd || 26180)
  const [amount, setAmount] = useState(1000000)
  const [updatedAt, setUpdatedAt] = useState(cached.updatedAt || null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const searchName = trip.destination.replace(/[·]/g, ' ').split(',')[0].trim()
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchName)}&count=1&language=ko&format=json`)
        const geo = await geoResponse.json()
        const place = geo.results?.[0]
        const weatherPromise = place
          ? fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code&daily=precipitation_probability_max&forecast_days=1&timezone=auto`).then((response) => response.json())
          : Promise.resolve(null)
        const exchangePromise = fetch('https://open.er-api.com/v6/latest/USD').then((response) => response.json())
        const [weatherData, exchangeData] = await Promise.all([weatherPromise, exchangePromise])
        if (!active) return

        const nextWeather = weatherData ? {
          temperature: weatherData.current?.temperature_2m,
          apparent: weatherData.current?.apparent_temperature,
          rain: weatherData.daily?.precipitation_probability_max?.[0],
          code: weatherData.current?.weather_code,
        } : cached.weather || fallbackWeather
        const nextVndToKrw = exchangeData.rates?.KRW && exchangeData.rates?.VND ? exchangeData.rates.KRW / exchangeData.rates.VND : cached.vndToKrw || 0.0565
        const nextUsdToVnd = exchangeData.rates?.VND || cached.usdToVnd || 26180
        const nextUpdatedAt = Date.now()
        setWeather(nextWeather)
        setVndToKrw(nextVndToKrw)
        setUsdToVnd(nextUsdToVnd)
        setUpdatedAt(nextUpdatedAt)
        localStorage.setItem(cacheKey, JSON.stringify({ weather: nextWeather, vndToKrw: nextVndToKrw, usdToVnd: nextUsdToVnd, updatedAt: nextUpdatedAt }))
      } catch {
        if (active) setNotice(cached.updatedAt ? '마지막 저장 정보를 표시합니다.' : '실시간 정보를 불러오지 못했습니다.')
      }
    }
    load()
    return () => { active = false }
  }, [cacheKey, cached, trip.destination])

  const openLens = async () => {
    setNotice('Google 렌즈를 실행하는 중입니다…')
    try {
      if (Capacitor.isNativePlatform()) {
        await ExternalApps.openGoogleLens()
        setNotice('Google 렌즈를 열었습니다.')
        return
      }
      window.open('https://lens.google.com/', '_blank', 'noopener,noreferrer')
      setNotice('Google 렌즈 웹을 열었습니다.')
    } catch (error) {
      setNotice(error?.message || 'Google 렌즈를 실행하지 못했습니다.')
    }
  }

  return (
    <section className="trip-live-tools" aria-label="여행 실시간 도구">
      <article className="live-tool-card weather-tool">
        <small>{trip.destination} 현재 날씨</small>
        <strong>{weatherIcon(weather.code)} {weather.temperature == null ? '--' : `${Math.round(weather.temperature)}°C`}</strong>
        <span>체감 {weather.apparent == null ? '--' : `${Math.round(weather.apparent)}°C`} · 비 {weather.rain == null ? '--' : `${weather.rain}%`}</span>
      </article>
      <button className="live-tool-card lens-tool" type="button" onClick={openLens}>
        <small>언어 감지 → 한국어</small>
        <strong>🌐 Google 렌즈</strong>
        <span>카메라로 메뉴판 바로 번역</span>
      </button>
      <article className="live-tool-card rate-tool">
        <small>오늘의 환율</small>
        <div><strong>₩50,000 → 약 {Math.round(50000 / vndToKrw).toLocaleString('ko-KR')}₫</strong><strong>$100 → 약 {Math.round(usdToVnd * 100).toLocaleString('ko-KR')}₫</strong></div>
        <span>{updatedAt ? `${new Date(updatedAt).toLocaleString('ko-KR')} 업데이트` : '환율 불러오는 중'}</span>
      </article>
      <article className="live-tool-card calculator-tool">
        <small>환전 계산기 · VND → KRW</small>
        <div><input type="text" inputMode="numeric" value={amount.toLocaleString('ko-KR')} onChange={(event) => setAmount(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)} aria-label="베트남 동 금액" /><b>→</b><output>{Math.round(amount * vndToKrw).toLocaleString('ko-KR')}원</output></div>
      </article>
      {notice && <p className="live-tool-notice" role="status">{notice}</p>}
    </section>
  )
}
