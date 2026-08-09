import { useMemo, useState } from 'react'

const parseGoogleMapsLink = (value) => {
  const text = value.trim()
  if (!/^https?:\/\//i.test(text)) throw new Error('Google 지도에서 공유한 링크를 붙여넣어 주세요.')

  const url = new URL(text)
  const isGoogleMaps = /(^|\.)google\.[a-z.]+$/i.test(url.hostname)
    || /(^|\.)maps\.app\.goo\.gl$/i.test(url.hostname)
    || /(^|\.)goo\.gl$/i.test(url.hostname)
  if (!isGoogleMaps) throw new Error('Google 지도 공유 링크만 사용할 수 있습니다.')

  const decoded = decodeURIComponent(text.replace(/\+/g, ' '))
  const placeMatch = decoded.match(/\/maps\/place\/([^/@?]+)/i)
  const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  const dataMatch = decoded.match(/!3d(-?\d+(?:\.\d+))!4d(-?\d+(?:\.\d+))/)
  const query = url.searchParams.get('query') || url.searchParams.get('q') || ''
  const queryMatch = query.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/)
  const coordinates = atMatch || dataMatch || queryMatch

  return {
    googlePlaceId: url.searchParams.get('query_place_id') || '',
    googleMapsUrl: text,
    name: placeMatch?.[1]?.trim() || '',
    address: '',
    latitude: coordinates ? Number(coordinates[1]) : '',
    longitude: coordinates ? Number(coordinates[2]) : '',
  }
}

export function GooglePlaceSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [sharedUrl, setSharedUrl] = useState('')
  const [message, setMessage] = useState('Google 지도 앱에서 장소를 찾은 뒤 공유 링크를 붙여넣으세요.')
  const searchUrl = useMemo(
    () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim() || '여행 장소')}`,
    [query],
  )

  const applySharedLink = () => {
    try {
      const place = parseGoogleMapsLink(sharedUrl)
      onSelect(place)
      setMessage(place.name || place.latitude !== ''
        ? '지도 링크에서 확인한 정보를 입력했습니다. 장소명과 주소를 확인해 주세요.'
        : '단축 지도 링크를 저장했습니다. 장소명과 주소를 직접 입력해 주세요.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const saveCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('이 기기에서는 현재 위치를 사용할 수 없습니다.')
      return
    }
    setMessage('현재 위치를 확인하고 있습니다…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = coords.latitude
        const longitude = coords.longitude
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
        onSelect({
          googlePlaceId: '',
          googleMapsUrl,
          name: '현재 위치',
          address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          latitude,
          longitude,
        })
        setSharedUrl(googleMapsUrl)
        setMessage('현재 위치와 지도 링크를 입력했습니다.')
      },
      () => setMessage('위치 권한을 허용한 뒤 다시 시도해 주세요.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div className="google-place-search external-map-search">
      <label>
        <span>Google 지도에서 검색</span>
        <div className="google-place-fallback-form">
          <input
            type="search"
            className="google-place-legacy-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: Pizza 4P's Au Co Hanoi"
          />
          <a className="external-map-button" href={searchUrl} target="_blank" rel="noreferrer">지도 열기</a>
        </div>
      </label>
      <label>
        <span>Google 지도 공유 링크</span>
        <div className="google-place-fallback-form">
          <input
            type="url"
            className="google-place-legacy-input"
            value={sharedUrl}
            onChange={(event) => setSharedUrl(event.target.value)}
            placeholder="Google 지도에서 공유한 링크 붙여넣기"
          />
          <button type="button" onClick={applySharedLink}>링크 적용</button>
        </div>
      </label>
      <button className="current-location-button" type="button" onClick={saveCurrentLocation}>◎ 현재 위치 저장</button>
      <p>{message}</p>
      <small className="external-map-cost-note">Google Maps Platform API를 호출하지 않는 무료 연결 방식입니다.</small>
    </div>
  )
}
