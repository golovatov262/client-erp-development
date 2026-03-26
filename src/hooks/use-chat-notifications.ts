import { useState, useEffect, useRef, useCallback } from "react";
import { api, ChatConversationStaff } from "@/lib/api";

const POLL_INTERVAL = 6000;

const playNotificationSound = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 500);
  } catch (e) {
    console.error(e);
  }
};

export interface ChatNotificationEvent {
  conversationId: number;
  memberName: string;
  preview: string;
}

const useChatNotifications = () => {
  const [totalUnread, setTotalUnread] = useState(0);
  const [lastEvent, setLastEvent] = useState<ChatNotificationEvent | null>(null);
  const prevUnreadRef = useRef<Record<number, number>>({});
  const initialLoadRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const list: ChatConversationStaff[] = await api.chat.staffList();
      const total = list.reduce((s, c) => s + (c.unread_count || 0), 0);
      setTotalUnread(total);

      if (initialLoadRef.current) {
        const map: Record<number, number> = {};
        list.forEach((c) => { map[c.id] = c.unread_count || 0; });
        prevUnreadRef.current = map;
        initialLoadRef.current = false;
        return;
      }

      for (const c of list) {
        const prev = prevUnreadRef.current[c.id] || 0;
        const curr = c.unread_count || 0;
        if (curr > prev) {
          playNotificationSound();
          setLastEvent({
            conversationId: c.id,
            memberName: c.member_name || "Пайщик",
            preview: c.last_message?.slice(0, 80) || "Новое сообщение",
          });

          if (Notification.permission === "granted") {
            try {
              new Notification("Новое сообщение в чате", {
                body: `${c.member_name}: ${c.last_message?.slice(0, 100) || ""}`,
                icon: "/favicon.ico",
                tag: `chat-${c.id}`,
              });
            } catch (e) {
              console.error(e);
            }
          }
          break;
        }
      }

      const map: Record<number, number> = {};
      list.forEach((c) => { map[c.id] = c.unread_count || 0; });
      prevUnreadRef.current = map;
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    poll();
    const iv = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [poll]);

  const clearEvent = useCallback(() => setLastEvent(null), []);

  return { totalUnread, lastEvent, clearEvent };
};

export default useChatNotifications;
