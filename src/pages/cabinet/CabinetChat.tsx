import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import Icon from "@/components/ui/icon";
import { api, ChatConversation, ChatMessage } from "@/lib/api";

const QUICK_QUESTIONS = [
  "Какой у меня остаток по займу?",
  "Когда следующий платёж?",
  "Как пополнить сбережение?",
  "Хочу досрочно погасить займ",
];

interface CabinetChatProps {
  open: boolean;
  onClose: () => void;
}

const CabinetChat = ({ open, onClose }: CabinetChatProps) => {
  const token = localStorage.getItem("cabinet_token") || "";
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const list = await api.chat.list(token);
      setConversations(list);
    } catch (e) { console.error(e); }
  }, [token]);

  const loadMessages = useCallback(async (convId: number) => {
    try {
      const msgs = await api.chat.messages(token, convId);
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadConversations().finally(() => setLoading(false));
  }, [open, loadConversations]);

  useEffect(() => {
    if (!activeConvId || !open) return;
    loadMessages(activeConvId);
    pollRef.current = setInterval(() => {
      if (!document.hidden) loadMessages(activeConvId);
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConvId, open, loadMessages]);

  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [open]);

  const openConversation = (id: number) => {
    setActiveConvId(id);
    setShowSidebar(false);
  };

  const handleCreate = async (subject?: string) => {
    try {
      const res = await api.chat.create(token, subject || "Новое обращение");
      await loadConversations();
      setActiveConvId(res.id);
      setShowSidebar(false);
    } catch (e) { console.error(e); }
  };

  const handleSend = async (msgText?: string) => {
    const body = (msgText || text).trim();
    if (!body || !activeConvId) return;
    setSending(true);
    setText("");
    const optimistic: ChatMessage = {
      id: Date.now(), sender_type: "client", sender_id: null,
      body, read_at: null, created_at: new Date().toISOString(), sender_name: "",
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    try {
      const res = await api.chat.send(token, activeConvId, body);
      if (res.ai_reply) {
        setMessages((prev) => [
          ...prev,
          { id: res.ai_reply!.id, sender_type: "ai", sender_id: null, body: res.ai_reply!.body, read_at: null, created_at: res.ai_reply!.created_at, sender_name: "ИИ-помощник" },
        ]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
      }
      loadConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const handleQuickQuestion = async (q: string) => {
    if (!activeConvId) {
      try {
        const res = await api.chat.create(token, q);
        await loadConversations();
        setActiveConvId(res.id);
        setShowSidebar(false);
        setTimeout(() => handleSend(q), 300);
      } catch (e) { console.error(e); }
    } else {
      handleSend(q);
    }
  };

  if (!open) return null;

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg sm:max-w-2xl h-[85vh] sm:h-[70vh] sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary text-white shrink-0">
          {!showSidebar && activeConvId && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => { setShowSidebar(true); setActiveConvId(null); }}>
              <Icon name="ArrowLeft" size={18} />
            </Button>
          )}
          <Icon name="MessageCircle" size={20} />
          <span className="font-semibold text-sm flex-1">
            {activeConv ? activeConv.subject || "Чат" : "Чат поддержки"}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={onClose}>
            <Icon name="X" size={18} />
          </Button>
        </div>

        {showSidebar || !activeConvId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b shrink-0">
              <Button className="w-full gap-2" onClick={() => handleCreate()}>
                <Icon name="Plus" size={16} />
                Новое обращение
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-12"><Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" /></div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Icon name="MessageCircle" size={28} className="text-primary" />
                  </div>
                  <div className="text-sm font-medium mb-1">Нет обращений</div>
                  <div className="text-xs text-muted-foreground mb-4">Задайте вопрос — мы поможем!</div>
                  <div className="space-y-2">
                    {QUICK_QUESTIONS.map((q) => (
                      <button key={q} onClick={() => handleQuickQuestion(q)} className="w-full text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {conversations.map((c) => (
                    <button key={c.id} onClick={() => openConversation(c.id)} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon name="MessageCircle" size={16} className="text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{c.subject || "Обращение"}</span>
                          {c.unread_count > 0 && (
                            <span className="min-w-[20px] h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center px-1.5 shrink-0">
                              {c.unread_count}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message || "Нет сообщений"}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.status === "open" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {c.status === "open" ? "Открыт" : "Закрыт"}
                          </span>
                          {c.last_message_at && (
                            <span className="text-[10px] text-muted-foreground">{new Date(c.last_message_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-sm text-muted-foreground mb-4">Начните диалог или выберите вопрос:</div>
                  <div className="space-y-2 max-w-xs mx-auto">
                    {QUICK_QUESTIONS.map((q) => (
                      <button key={q} onClick={() => handleSend(q)} className="w-full text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isMe = m.sender_type === "client";
                    const isAi = m.sender_type === "ai";
                    return (
                      <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isMe ? "bg-primary text-white" : isAi ? "bg-violet-50 border border-violet-200" : "bg-muted"}`}>
                          {!isMe && (
                            <div className={`text-[10px] font-medium mb-1 ${isAi ? "text-violet-600" : "text-muted-foreground"}`}>
                              {isAi ? "ИИ-помощник" : m.sender_name || "Менеджер"}
                            </div>
                          )}
                          <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                          <div className={`text-[10px] mt-1 text-right ${isMe ? "text-white/60" : "text-muted-foreground/60"}`}>
                            {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
            {activeConv?.status === "closed" ? (
              <div className="px-4 py-3 border-t text-center text-sm text-muted-foreground">
                Обращение закрыто
              </div>
            ) : (
              <div className="px-3 py-2 border-t flex gap-2 shrink-0">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Напишите сообщение..."
                  className="flex-1"
                  disabled={sending}
                />
                <Button size="icon" onClick={() => handleSend()} disabled={!text.trim() || sending}>
                  {sending ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CabinetChat;