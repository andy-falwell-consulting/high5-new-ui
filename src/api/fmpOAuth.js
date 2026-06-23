// FileMaker Data API OAuth login (Google) for per-user write attribution.
//
// On this host (pcifmhosting.com) the standard Data API app-type (9) is blocked
// for /oauth/getoauthurl, but the WebDirect app-type (7) works and the Data API
// /sessions endpoint honors the resulting request — verified end-to-end. So we
// mint the request via app-type 7, send the user through Google in a popup, then
// exchange the returned identifier for a user-bound Data API token.
//
// Flow:
//   1. GET /oauth/getoauthurl (app-type 7) → Google auth URL + X-FMS-Request-ID
//   2. popup → Google → FMS redirects to /oauth-callback.html?identifier=…
//   3. POST /fmi/.../sessions with the request id + identifier → user token

import { getCurrentEnv } from '../config/fmpEnvironments'
import { setFmpUserSession } from './filemaker'

const APP_TYPE = '7'        // WebDirect (app-type 9 / Data API is blocked on this host)
const APP_VERSION = '15'

function hostAddress() {
  try { return new URL(getCurrentEnv().host).host } catch { return '' }
}

export async function connectFmpAsUser(displayName) {
  const env = getCurrentEnv()
  const addr = hostAddress()
  const returnUrl = `${window.location.origin}/fmp-oauth-callback.html`

  // 1. Ask FMS for the provider auth URL + a request id.
  const res = await fetch(
    `/oauth/getoauthurl?trackingID=${Date.now()}&provider=Google&address=${encodeURIComponent(addr)}&X-FMS-OAuth-AuthType=2`,
    { headers: {
      'X-FMS-Application-Type': APP_TYPE,
      'X-FMS-Application-Version': APP_VERSION,
      'X-FMS-Return-URL': returnUrl,
    } }
  )
  const requestId = res.headers.get('x-fms-request-id')
  const authUrl = (await res.text()).trim()
  if (!requestId || !/^https?:\/\//.test(authUrl)) {
    throw new Error(`Could not start FileMaker sign-in (HTTP ${res.status}, result ${res.headers.get('x-fms-result') || '?'})`)
  }

  // 2. Send the user through Google in a popup; resolve with the identifier.
  const identifier = await runPopup(authUrl)

  // 3. Exchange the identifier for a user-bound Data API token.
  const s = await fetch(`/fmi/data/v2/databases/${env.db}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FM-Data-OAuth-Request-Id': requestId,
      'X-FM-Data-OAuth-Identifier': identifier,
    },
    body: '{}',
  })
  const data = await s.json().catch(() => ({}))
  const token = data?.response?.token
  if (!token) {
    throw new Error(data?.messages?.[0]?.message || `FileMaker rejected the sign-in (HTTP ${s.status})`)
  }

  setFmpUserSession(token, displayName)
  return { token, name: displayName }
}

function runPopup(authUrl) {
  return new Promise((resolve, reject) => {
    const w = 520, h = 660
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2)
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2)
    const popup = window.open(authUrl, 'fmp_oauth', `width=${w},height=${h},left=${left},top=${top}`)
    if (!popup) return reject(new Error('Popup blocked — allow popups for this site and try again'))

    let settled = false
    const cleanup = () => {
      clearInterval(timer)
      window.removeEventListener('message', onMsg)
      try { popup.close() } catch { /* ignore */ }
    }
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'fmp-oauth-callback') return
      settled = true
      cleanup()
      if (e.data.identifier) resolve(e.data.identifier)
      else reject(new Error('Sign-in returned no identifier. Params: ' + JSON.stringify(e.data.params || {})))
    }
    const timer = setInterval(() => {
      if (popup.closed && !settled) { cleanup(); reject(new Error('Sign-in window was closed')) }
    }, 500)
    window.addEventListener('message', onMsg)
  })
}
