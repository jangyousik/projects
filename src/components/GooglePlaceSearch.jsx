import { useEffect, useRef, useState } from 'react'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
let googleMapsPromise

const loadGoogleMaps = () => {
  if (window.google?.maps?.places) return Promise.resolve(window.google)
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
  const [message, setMessage] = useState(apiKey ? '장소 이름을 검색하세요.' : 'Google Maps API 키 설정 후 자동 검색을 사용할 수 있습니다.')

  useEffect(() => {
    if (!apiKey || !containerRef.current) return undefined
    let active = true
    let autocomplete

    loadGoogleMaps()
      .then(async (google) => {
        await google.maps.importLibrary('places')
        if (!active || !containerRef.current) return
        autocomplete = new google.maps.places.PlaceAutocompleteElement({
          includedRegionCodes: ['kr', 'vn', 'jp', 'th', 'sg'],
        })
        autocomplete.setAttribute('aria-label', 'Google 장소 검색')
        autocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
          const place = placePrediction.toPlace()
          await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'] })
          onSelect({
            googlePlaceId: place.id || '',
            name: place.displayName || placePrediction.text?.toString() || '',
            address: place.formattedAddress || '',
            latitude: place.location?.lat() ?? null,
            longitude: place.location?.lng() ?? null,
            googleMapsUrl: place.googleMapsURI || '',
          })
          setMessage('장소 정보를 가져왔습니다. 메모를 확인하고 저장하세요.')
        })
        containerRef.current.replaceChildren(autocomplete)
      })
      .catch((error) => setMessage(error.message))

    return () => {
      active = false
      autocomplete?.remove()
    }
  }, [onSelect])

  return (
    <div className="google-place-search">
      <div ref={containerRef} />
      <p>{message}</p>
      {!apiKey && <a href="https://www.google.com/maps/search/" target="_blank" rel="noreferrer">Google 지도에서 먼저 찾아보기</a>}
    </div>
  )
}
