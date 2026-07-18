import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

export const mobileAuthRedirectUrl = 'https://travel-app-six-opal.vercel.app'

const completeAuthFromUrl = async (url) => {
  if (!url || !supabase) return
  const parsed = new URL(url)
  const code = parsed.searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return
  }

  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) throw error
  }
}

export const registerMobileAuth = async (onError) => {
  if (!Capacitor.isNativePlatform()) return () => {}

  const listener = await App.addListener('appUrlOpen', ({ url }) => {
    completeAuthFromUrl(url)
      .then(() => Browser.close().catch(() => {}))
      .catch(onError)
  })
  const launch = await App.getLaunchUrl()
  if (launch?.url) completeAuthFromUrl(launch.url).catch(onError)

  return () => listener.remove()
}

export const getAuthRedirectUrl = () => (
  Capacitor.isNativePlatform() ? mobileAuthRedirectUrl : window.location.origin
)
