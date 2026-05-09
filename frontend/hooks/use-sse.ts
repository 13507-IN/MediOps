"use client"

import { useEffect, useRef, useCallback, useState } from "react"

type SSEEvent = {
  type: string
  data: any
}

type EventHandlers = Record<string, (data: any) => void>

interface UseSSEReturn {
  isConnected: boolean
  lastEvent: SSEEvent | null
  connect: () => void
  disconnect: () => void
  on: (event: string, handler: (data: any) => void) => void
  off: (event: string, handler: (data: any) => void) => void
}

export function useSSE(token: string | null): UseSSEReturn {
  const eventSourceRef = useRef<EventSource | null>(null)
  const handlersRef = useRef<EventHandlers>({})
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null)
  const tokenRef = useRef(token)

  tokenRef.current = token

  const connect = useCallback(() => {
    if (!tokenRef.current || eventSourceRef.current) return

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"
    const url = `${API_URL}/api/sse`

    const es = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
      },
    } as EventSourceInit)

    es.addEventListener("open", () => {
      console.log("📡 SSE connected")
      setIsConnected(true)
    })

    es.addEventListener("error", (err) => {
      console.error("SSE connection error:", err)
      setIsConnected(false)

      if (es.readyState === EventSource.CLOSED) {
        eventSourceRef.current = null
      }
    })

    es.addEventListener("connected", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "connected", data })
      handlersRef.current["connected"]?.(data)
    })

    es.addEventListener("heartbeat", (e) => {
      const data = JSON.parse(e.data)
      handlersRef.current["heartbeat"]?.(data)
    })

    es.addEventListener("document:uploading", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "document:uploading", data })
      handlersRef.current["document:uploading"]?.(data)
    })

    es.addEventListener("document:processing", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "document:processing", data })
      handlersRef.current["document:processing"]?.(data)
    })

    es.addEventListener("document:completed", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "document:completed", data })
      handlersRef.current["document:completed"]?.(data)
    })

    es.addEventListener("document:failed", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "document:failed", data })
      handlersRef.current["document:failed"]?.(data)
    })

    es.addEventListener("resource:uploading", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "resource:uploading", data })
      handlersRef.current["resource:uploading"]?.(data)
    })

    es.addEventListener("resource:completed", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "resource:completed", data })
      handlersRef.current["resource:completed"]?.(data)
    })

    es.addEventListener("resource:failed", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "resource:failed", data })
      handlersRef.current["resource:failed"]?.(data)
    })

    es.addEventListener("allocation:created", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "allocation:created", data })
      handlersRef.current["allocation:created"]?.(data)
    })

    es.addEventListener("allocation:deallocated", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "allocation:deallocated", data })
      handlersRef.current["allocation:deallocated"]?.(data)
    })

    es.addEventListener("alert:low-stock", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "alert:low-stock", data })
      handlersRef.current["alert:low-stock"]?.(data)
    })

    es.addEventListener("allocation:lifecycle-change", (e) => {
      const data = JSON.parse(e.data)
      setLastEvent({ type: "allocation:lifecycle-change", data })
      handlersRef.current["allocation:lifecycle-change"]?.(data)
    })

    eventSourceRef.current = es
  }, [])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
      setIsConnected(false)
      console.log("📡 SSE disconnected")
    }
  }, [])

  const on = useCallback((event: string, handler: (data: any) => void) => {
    handlersRef.current[event] = handler
  }, [])

  const off = useCallback((event: string, handler: (data: any) => void) => {
    if (handlersRef.current[event] === handler) {
      delete handlersRef.current[event]
    }
  }, [])

  useEffect(() => {
    if (token) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [token, connect, disconnect])

  return {
    isConnected,
    lastEvent,
    connect,
    disconnect,
    on,
    off,
  }
}
