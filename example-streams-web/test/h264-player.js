import { Auth, RtspMp4Pipeline } from '/msl-streams.min.js'

const mediaElement = document.querySelector('video')

function showLoading() {
  const el = document.getElementById('loadingOverlay')
  if (el) {
    el.classList.add('visible')
    el.setAttribute('aria-hidden', 'false')
  }
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay')
  if (el) {
    el.classList.remove('visible')
    el.setAttribute('aria-hidden', 'true')
  }
}

const wsUri = () => `ws://${window.location.hostname}:8854/`
const rtspUri = `rtsp://admin:Tencent123@192.168.1.108/cam/realmonitor?channel=1&subtype=0`

function authFromRtspUri(uri) {
  try {
    const u = new URL(uri)
    if (u.username) return new Auth(u.username, u.password || '')
  } catch (_) { }
  return null
}

const RECONNECT_DELAY_MS = 2000
const WS_TIMEOUT_MS = 4000

let currentPipeline = null
let reconnectTimerId = null
let connecting = false

function clearVideo() {
  mediaElement.srcObject = null
  mediaElement.src = ''
  mediaElement.load()
}

function scheduleReconnect() {
  if (reconnectTimerId || document.visibilityState === 'hidden') return
  reconnectTimerId = setTimeout(() => {
    reconnectTimerId = null
    connectOnce()
  }, RECONNECT_DELAY_MS)
}

function createPipeline() {
  const pipeline = new RtspMp4Pipeline({
    ws: { uri: wsUri(), timeout: WS_TIMEOUT_MS },
    rtsp: { uri: rtspUri },
    mediaElement,
    onStreamError: () => {
      console.log('[RTSP-Player] RTSP error, will reconnect')
      teardownAndReconnect()
    },
    onWebSocketClose: (code) => {
      if (code === 1000) return
      console.log('[RTSP-Player] WebSocket closed, will reconnect', code)
      teardownAndReconnect()
    },
  })
  const auth = authFromRtspUri(rtspUri)
  if (auth) pipeline.rtsp.auth = auth
  pipeline.mse.mediaSource.addEventListener(
    'sourceopen',
    () => {
      pipeline.mse.mediaSource.duration = 0
    },
    { once: true }
  )
  return pipeline
}

function connectOnce() {
  if (connecting || document.visibilityState === 'hidden') return
  connecting = true
  showLoading()
  clearVideo()

  if (currentPipeline) {
    try {
      currentPipeline.close()
    } catch (_) { }
    currentPipeline = null
  }

  const pipeline = createPipeline()
  pipeline
    .start()
    .then(() => {
      connecting = false
      currentPipeline = pipeline
      hideLoading()
      console.log('[RTSP-Player] connected, start playing')
      pipeline.play()
      mediaElement.addEventListener(
        'canplay',
        () => {
          mediaElement.play().catch(() => { })
        },
        { once: true }
      )
    })
    .catch((err) => {
      connecting = false
      console.log(
        '[RTSP-Player] connect failed, will retry',
        err?.message ?? err
      )
      scheduleReconnect()
    })
}

function teardownAndReconnect() {
  if (currentPipeline) {
    try {
      currentPipeline.close()
    } catch (_) { }
    currentPipeline = null
  }
  clearVideo()
  scheduleReconnect()
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    if (currentPipeline) {
      currentPipeline.rtsp.pause().catch(() => { })
      currentPipeline.pause()
    }
  } else {
    if (!currentPipeline && !connecting) {
      connectOnce()
    } else if (currentPipeline) {
      currentPipeline.rtsp.play().catch(() => { })
      currentPipeline.play()
    }
  }
}

document.addEventListener('visibilitychange', onVisibilityChange)

connectOnce()
