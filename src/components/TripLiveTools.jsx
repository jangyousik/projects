import { useEffect, useMemo, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

const ExternalApps = registerPlugin('ExternalApps')
const fallbackWeather = { temperature: null, apparent: null, rain: null, code: null }

const currencyMeta = {
  VND: { name: '베트남 동', defaultAmount: 1000000, maximumFractionDigits: 0 },
  JPY: { name: '일본 엔', defaultAmount: 10000, maximumFractionDigits: 0 },
  USD: { name: '미국 달러', defaultAmount: 100, maximumFractionDigits: 2 },
  KRW: { name: '한국 원', defaultAmount: 50000, maximumFractionDigits: 0 },
  THB: { name: '태국 바트', defaultAmount: 1000, maximumFractionDigits: 0 },
  SGD: { name: '싱가포르 달러', defaultAmount: 100, maximumFractionDigits: 2 },
  EUR: { name: '유로', defaultAmount: 100, maximumFractionDigits: 2 },
  GBP: { name: '영국 파운드', defaultAmount: 100, maximumFractionDigits: 2 },
  CNY: { name: '중국 위안', defaultAmount: 1000, maximumFractionDigits: 0 },
  TWD: { name: '대만 달러', defaultAmount: 1000, maximumFractionDigits: 0 },
  PHP: { name: '필리핀 페소', defaultAmount: 1000, maximumFractionDigits: 0 },
  MYR: { name: '말레이시아 링깃', defaultAmount: 1000, maximumFractionDigits: 0 },
  IDR: { name: '인도네시아 루피아', defaultAmount: 1000000, maximumFractionDigits: 0 },
}

function weatherIcon(code) {
  if (code == null) return '🌤️'
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67 || code >= 80) return '🌧️'
  return '🌤️'
}

function formatCurrency(amount, currency) {
  const options = currencyMeta[currency] || currencyMeta.USD
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: options.maximumFractionDigits,
  }).format(amount)
}

export function TripLiveTools({ trip }) {
  const currency = trip.currency || 'VND'
  const meta = currencyMeta[currency] || { name: currency, defaultAmount: 100, maximumFractionDigits: 2 }
  const cacheKey = useMemo(() => `trip-live-tools:${trip.destination}:${currency}`, [trip.destination, currency])
  const cached = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(cacheKey)) || {} } catch { return {} }
  }, [cacheKey])
  const [weather, setWeather] = useState(cached.weather || fallbackWeather)
  const [rates, setRates] = useState(cached.rates || null)
  const [amount, setAmount] = useState(meta.defaultAmount)
  const [updatedAt, setUpdatedAt] = useState(cached.updatedAt || null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setAmount(meta.defaultAmount)
  }, [currency, meta.defaultAmount])

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
        const nextRates = exchangeData.rates || cached.rates || null
        const nextUpdatedAt = Date.now()
        setWeather(nextWeather)
        setRates(nextRates)
        setUpdatedAt(nextUpdatedAt)
        localStorage.setItem(cacheKey, JSON.stringify({ weather: nextWeather, rates: nextRates, updatedAt: nextUpdatedAt }))
      } catch {
        if (active) setNotice(cached.updatedAt ? '마지막으로 저장된 정보를 표시합니다.' : '실시간 정보를 불러오지 못했습니다.')
      }
    }
    load()
    return () => { active = false }
  }, [cacheKey, cached, trip.destination])

  const localPerKrw = rates?.[currency] && rates?.KRW ? rates[currency] / rates.KRW : null
  const localPerUsd = rates?.[currency] || null
  const krwPerLocal = rates?.KRW && rates?.[currency] ? rates.KRW / rates[currency] : null

  const openLens = async () => {
    setNotice('Google 렌즈를 실행하는 중입니다.')
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

  const openTranslate = async () => {
    setNotice('Google 번역을 실행하는 중입니다.')
    try {
      if (Capacitor.isNativePlatform()) {
        await ExternalApps.openGoogleTranslate()
        setNotice('Google 번역을 열었습니다.')
        return
      }
      window.open('https://translate.google.com/?sl=auto&tl=ko&op=translate', '_blank', 'noopener,noreferrer')
      setNotice('Google 번역 웹을 열었습니다.')
    } catch (error) {
      setNotice(error?.message || 'Google 번역을 실행하지 못했습니다.')
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
      <button className="live-tool-card translate-tool" type="button" onClick={openTranslate}>
        <small>대화·문장 번역</small>
        <strong>文 Google 번역</strong>
        <span>번역 앱 바로 열기</span>
      </button>
      <article className="live-tool-card rate-tool">
        <small>오늘의 환율 · {meta.name}</small>
        <div>
          <strong>₩50,000 → {localPerKrw ? `약 ${formatCurrency(50000 * localPerKrw, currency)}` : '불러오는 중'}</strong>
          <strong>$100 → {localPerUsd ? `약 ${formatCurrency(100 * localPerUsd, currency)}` : '불러오는 중'}</strong>
        </div>
        <span>{updatedAt ? `${new Date(updatedAt).toLocaleString('ko-KR')} 업데이트` : '환율 불러오는 중'}</span>
      </article>
      <article className="live-tool-card calculator-tool">
        <small>환전 계산기 · {currency} → KRW</small>
        <div>
          <input type="text" inputMode="numeric" value={amount.toLocaleString('ko-KR')} onChange={(event) => setAmount(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)} aria-label={`${meta.name} 금액`} />
          <b>→</b>
          <output>{krwPerLocal ? formatCurrency(amount * krwPerLocal, 'KRW') : '불러오는 중'}</output>
        </div>
      </article>
      {notice && <p className="live-tool-notice" role="status">{notice}</p>}
    </section>
  )
}
