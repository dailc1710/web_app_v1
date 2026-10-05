export type SyncTopic =
  | "submissions"
  | "appointments"
  | "statuses"
  | "accounts"
  | "notifications"

const channelName = "tmmc-live-sync"
const localEventName = "tmmc:sync"

export function publishSync(topic: SyncTopic) {
  window.dispatchEvent(new CustomEvent(localEventName, { detail: { topic } }))
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(channelName)
    channel.postMessage({ topic, sentAt: Date.now() })
    channel.close()
  }
}

export function subscribeSync(listener: (topic?: SyncTopic) => void) {
  const onLocal = (event: Event) =>
    listener((event as CustomEvent<{ topic?: SyncTopic }>).detail?.topic)
  const onStorage = () => listener()
  const channel =
    "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null
  const onMessage = (event: MessageEvent<{ topic?: SyncTopic }>) =>
    listener(event.data?.topic)

  window.addEventListener(localEventName, onLocal)
  window.addEventListener("storage", onStorage)
  channel?.addEventListener("message", onMessage)

  return () => {
    window.removeEventListener(localEventName, onLocal)
    window.removeEventListener("storage", onStorage)
    channel?.removeEventListener("message", onMessage)
    channel?.close()
  }
}
