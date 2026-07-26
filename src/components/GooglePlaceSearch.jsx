import { useCallback, useEffect, useRef, useState } from 'react'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
let googleMapsPromise

const loadGoogleMaps = () => {
  if (window.google?.maps?.places || window.google?.maps?.importLibrary) return Promise.resolve(window.google)
  if (!apiKey) return Promise.reject(new Error('Google Maps API 키가 설정되지 않았습니다.'))
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly&loading=async`
      script.async = true
      script.onload = () => resolve(window.google)
      script.onerror = () => reject(new Error('Google 장소 검색을 불러오지 못했습니다.'))
      document.head.appendChild(script)
    })
  }
  return googleMapsPromise
}

export function GooglePlaceSearch({ onSelect }) {
  const containerRef = useRef(null)
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const googleRef = useRef(null)
  const selectedPointRef = useRef(null)
  const resolveSelectedPointRef = useRef(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [message, setMessage] = useState(apiKey ? '장소 이름을 검색하거나 지도에서 직접 선택하세요.' : 'Google Maps API 키 설정 후 자동 검색을 사용할 수 있습니다.')

  const showPoint = useCallback((google, location, zoom = 16) => {
    if (!mapRef.current) return
    selectedPointRef.current = location
    markerRef.current?.setMap(null)
    markerRef.current = new google.maps.Marker({ position: location, map: mapRef.current })
    mapRef.current.panTo(location)
    mapRef.current.setZoom(zoom)
  }, [])

  const selectMapLocation = useCallback(async (google, location) => {
    showPoint(google, location)
    setMessage('선택한 위치의 주소를 확인하고 있습니다…')
    let result
    try {
      const response = await new google.maps.Geocoder().geocode({ location })
      result = response.results?.[0]
    } catch {
      // The location itself remains usable if reverse geocoding is unavailable.
    }
    const address = result?.formatted_address || `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
    const name = result?.address_components?.[0]?.long_name || '지도에서 선택한 장소'
    onSelect({
      googlePlaceId: result?.place_id || '',
      name,
      address,
      latitude: location.lat,
      longitude: location.lng,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`,
    })
    setMessage(result ? '지도에서 장소와 주소를 선택했습니다.' : '위치를 선택했습니다. 주소가 좌표로 입력되었으니 확인해 주세요.')
  }, [onSelect, showPoint])

  useEffect(() => {
    if (!apiKey || !containerRef.current) return undefined
    let active = true
    let autocomplete
    let autocompleteListener
    let fallbackForm
    let fallbackSubmit

    loadGoogleMaps()
      .then(async (google) => {
        let placesLibrary = google.maps.places
        if (typeof google.maps.importLibrary === 'function') {
          placesLibrary = await google.maps.importLibrary('places') || placesLibrary
        }
        if (!active || !containerRef.current) return
        googleRef.current = google

        const applySelectedPlace = (place, fallbackName = '') => {
          const location = place.location
            ? { lat: place.location.lat(), lng: place.location.lng() }
            : place.geometry?.location
              ? { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }
              : null
          onSelect({
            googlePlaceId: place.id || place.place_id || '',
            name: place.displayName || place.name || fallbackName,
            address: place.formattedAddress || place.formatted_address || '',
            latitude: location?.lat ?? null,
            longitude: location?.lng ?? null,
            googleMapsUrl: place.googleMapsURI || place.url || (location
              ? `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`
              : ''),
          })
          if (location) {
            selectedPointRef.current = location
            resolveSelectedPointRef.current = false
            setMapOpen(true)
            showPoint(google, location)
          }
          setMessage('검색한 장소를 선택했습니다. 지도 핀과 입력 내용을 확인하세요.')
        }

        if (placesLibrary?.PlaceAutocompleteElement) {
          autocomplete = new placesLibrary.PlaceAutocompleteElement()
          autocomplete.setAttribute('aria-label', 'Google 장소 검색')
          autocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
            const place = placePrediction.toPlace()
            await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'] })
            applySelectedPlace(place, placePrediction.text?.toString() || '')
          })
          containerRef.current.replaceChildren(autocomplete)
        } else if (placesLibrary?.Autocomplete) {
          const input = document.createElement('input')
          input.type = 'search'
          input.className = 'google-place-legacy-input'
          input.placeholder = '장소명이나 주소를 검색하세요'
          input.setAttribute('aria-label', 'Google 장소 검색')
          containerRef.current.replaceChildren(input)
          autocomplete = new placesLibrary.Autocomplete(input, {
            fields: ['place_id', 'name', 'formatted_address', 'geometry', 'url'],
          })
          autocompleteListener = autocomplete.addListener('place_changed', () => {
            applySelectedPlace(autocomplete.getPlace(), input.value)
          })
        } else {
          fallbackForm = document.createElement('form')
          fallbackForm.className = 'google-place-fallback-form'
          const input = document.createElement('input')
          input.type = 'search'
          input.className = 'google-place-legacy-input'
          input.placeholder = '장소명이나 주소를 입력하세요'
          input.setAttribute('aria-label', 'Google 장소 검색')
          const button = document.createElement('button')
          button.type = 'submit'
          button.textContent = '검색'
          fallbackForm.append(input, button)
          containerRef.current.replaceChildren(fallbackForm)
          fallbackSubmit = async (event) => {
            event.preventDefault()
            const query = input.value.trim()
            if (!query) {
              setMessage('찾을 장소명이나 주소를 입력해 주세요.')
              return
            }
            setMessage('Google 지도에서 장소를 찾고 있습니다…')
            try {
              const response = await new google.maps.Geocoder().geocode({ address: query })
              const result = response.results?.[0]
              if (!result) {
                setMessage('검색 결과가 없습니다. 도시 이름과 장소명을 함께 입력해 주세요.')
                return
              }
              applySelectedPlace(result, query)
            } catch {
              setMessage('장소를 찾지 못했습니다. 도시 이름과 장소명을 함께 입력해 주세요.')
            }
          }
          fallbackForm.addEventListener('submit', fallbackSubmit)
          setMessage('장소명을 입력해 Google 지도에서 검색하거나 지도에서 직접 선택하세요.')
        }
      })
      .catch((error) => setMessage(error.message))

    return () => {
      active = false
      autocompleteListener?.remove()
      autocomplete?.remove?.()
      if (fallbackForm && fallbackSubmit) fallbackForm.removeEventListener('submit', fallbackSubmit)
    }
  }, [onSelect, showPoint])

  useEffect(() => {
    if (!mapOpen || !mapContainerRef.current || !apiKey) return undefined
    let active = true
    let clickListener
    setMapLoading(true)
    loadGoogleMaps()
      .then(async (google) => {
        if (google.maps.importLibrary) await google.maps.importLibrary('maps')
        if (!active || !mapContainerRef.current) return
        googleRef.current = google
        const initialPoint = selectedPointRef.current || { lat: 20, lng: 105 }
        mapRef.current = new google.maps.Map(mapContainerRef.current, {
          center: initialPoint,
          zoom: selectedPointRef.current ? 16 : 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: true,
        })
        if (selectedPointRef.current) {
          if (resolveSelectedPointRef.current) {
            resolveSelectedPointRef.current = false
            selectMapLocation(google, selectedPointRef.current)
          } else {
            showPoint(google, selectedPointRef.current)
          }
        }
        clickListener = mapRef.current.addListener('click', (event) => {
          const lat = event.latLng?.lat()
          const lng = event.latLng?.lng()
          if (Number.isFinite(lat) && Number.isFinite(lng)) selectMapLocation(google, { lat, lng })
        })
        setMapLoading(false)
      })
      .catch((error) => {
        setMapLoading(false)
        setMessage(error.message)
      })
    return () => {
      active = false
      clickListener?.remove()
      markerRef.current?.setMap(null)
      markerRef.current = null
      mapRef.current = null
    }
  }, [mapOpen, selectMapLocation, showPoint])

  const selectCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('이 기기에서는 현재 위치를 사용할 수 없습니다.')
      return
    }
    setMessage('현재 위치를 확인하고 있습니다…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude }
        selectedPointRef.current = location
        resolveSelectedPointRef.current = true
        setMapOpen(true)
        if (googleRef.current && mapRef.current) {
          resolveSelectedPointRef.current = false
          selectMapLocation(googleRef.current, location)
        }
      },
      () => setMessage('위치 권한을 허용한 뒤 다시 시도해 주세요.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div className="google-place-search">
      <div ref={containerRef} />
      {apiKey && <div className="google-map-actions">
        <button type="button" onClick={() => setMapOpen((current) => !current)}>{mapOpen ? '지도 닫기' : '🗺️ 지도에서 선택'}</button>
        <button type="button" onClick={selectCurrentLocation}>◎ 현재 위치</button>
      </div>}
      {mapOpen && <div className="google-map-picker">
        {mapLoading && <span>지도를 불러오는 중…</span>}
        <div ref={mapContainerRef} aria-label="장소를 선택하는 Google 지도" />
        <small>지도를 움직이고 원하는 지점을 누르면 장소와 좌표가 입력됩니다.</small>
      </div>}
      <p>{message}</p>
      {!apiKey && <a href="https://www.google.com/maps/search/" target="_blank" rel="noreferrer">Google 지도에서 먼저 찾아보기</a>}
    </div>
  )
}
