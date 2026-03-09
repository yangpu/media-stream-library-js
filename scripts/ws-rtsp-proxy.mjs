#!/usr/bin/env node

import { connect } from 'node:net'
import { WebSocketServer } from 'ws'
import util from 'node:util'

function usage() {
  console.error(`
Usage: ws-rtsp-proxy <port-map> [<port-map> ...]

Options:
 port-map       A map of WebSocket server port (proxy) to RTSP server port (destination)
                Example: 8854:8554
`)
}

const [...portmaps] = process.argv.slice(2)

if (portmaps.length === 0) {
  usage()
  process.exit(1)
}

for (const portmap of portmaps) {
  const [wsPort, rtspPort] = portmap.split(':')
  console.log(
    `starting WebSocket server at ws://localhost:${wsPort} proxying data to rtsp://localhost:${rtspPort}`
  )

  const defaultRtspPort = Number(rtspPort) || 554

  const wss = new WebSocketServer({ host: '::', port: Number(wsPort) })
  let rtspSocket
  let pendingMessages = []

  /** 从首条 RTSP 请求里解析目标地址，例如 DESCRIBE rtsp://user:pass@host:port/path RTSP/1.0 */
  function parseRtspTarget(firstChunk) {
    const firstLine = firstChunk.toString('utf8').split(/\r?\n/)[0] || ''
    const uri = firstLine.split(/\s+/)[1]
    if (!uri || !uri.startsWith('rtsp')) return null
    try {
      const u = new URL(uri)
      return { host: u.hostname, port: u.port ? Number(u.port) : defaultRtspPort }
    } catch {
      return null
    }
  }

  wss.on('connection', (webSocket) => {
    rtspSocket?.destroy()
    rtspSocket = null
    pendingMessages = []

    console.log('new connection', new Date())

    function forwardToRtsp(data) {
      if (rtspSocket && rtspSocket.writable) {
        rtspSocket.write(data)
      } else {
        pendingMessages.push(data)
      }
    }

    function flushPending() {
      if (!rtspSocket || !rtspSocket.writable) return
      for (const chunk of pendingMessages) rtspSocket.write(chunk)
      pendingMessages = []
    }

    webSocket.on('message', (data) => {
      if (!rtspSocket) {
        const target = parseRtspTarget(data)
        const host = target?.host ?? '127.0.0.1'
        const port = target?.port ?? defaultRtspPort
        console.log('rtsp target from URI:', host + ':' + port)
        rtspSocket = connect(port, host)
        rtspSocket.on('connect', () => flushPending())
        rtspSocket.on('data', (chunk) => {
          if (webSocket.readyState === 1) webSocket.send(chunk)
        })
        rtspSocket.on('error', (err) => {
          console.error('RTSP socket fail:', err)
          if (webSocket.readyState === 1) webSocket.close(4000, 'RTSP error')
        })
        rtspSocket.on('close', (hadError) => {
          rtspSocket = null
          if (webSocket.readyState === 1) webSocket.close(4000, 'RTSP closed')
        })
        forwardToRtsp(data)
        return
      }
      forwardToRtsp(data)
    })
    webSocket.on('error', (err) => {
      console.error('WebSocket fail:', err)
      rtspSocket?.end()
    })
    webSocket.on('close', () => {
      rtspSocket?.end()
      rtspSocket = null
    })
  })

  wss.on('error', (err) => {
    console.error('WebSocket server fail:', err)
  })
}
