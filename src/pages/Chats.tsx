import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import Icon from "@/components/ui/icon";
import { api, ChatConversationStaff, ChatMessage } from "@/lib/api";

const Chats = () => {
  const [conversations, setConversations] = useState<ChatConversationStaff[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const list = await api.chat.staffList();
      setConversations(list);
    } catch (e) { console.error(e); }
  }, []);

  const loadMessages = useCallback(async (convId: number) => {
    try {
      const msgs = await api.chat.staffMessages(convId);
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
    let iv = setInterval(loadConversations, 30000);
    const onVisibility = () => {
      clearInterval(iv);
      if (document.hidden) {
        iv = setInterval(loadConversations, 120000);
      } else {
        loadConversations();
        iv = setInterval(loadConversations, 30000);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVisibility); };
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    pollRef.current = setInterval(() => {
      if (!document.hidden) loadMessages(activeConvId);
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeConvId, loadMessages]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !activeConvId) return;
    setSending(true);
    setText("");
    const optimistic: ChatMessage = {
      id: Date.now(), sender_type: "staff", sender_id: null,
      body, read_at: null, created_at: new Date().toISOString(), edited_at: null, sender_name: "",
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    try {
      await api.chat.staffSend(activeConvId, body);
      loadConversations();
    } catch (e) {
      console.error(e);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const handleClose = async (convId: number) => {
    try {
      await api.chat.staffClose(convId);
      loadConversations();
      if (activeConvId === convId) loadMessages(convId);
    } catch (e) { console.error(e); }
  };

  const handleReopen = async (convId: number) => {
    try {
      await api.chat.staffReopen(convId);
      loadConversations();
      if (activeConvId === convId) loadMessages(convId);
    } catch (e) { console.error(e); }
  };

  const handleToggleAi = async (convId: number, enabled: boolean) => {
    try {
      await api.chat.toggleAi(convId, enabled);
      loadConversations();
    } catch (e) { console.error(e); }
  };

  const handleEditStart = (m: ChatMessage) => {
    setEditingId(m.id);
    setEditText(m.body);
  };

  const handleEditSave = async (msgId: number) => {
    const body = editText.trim();
    if (!body || !activeConvId) return;
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, body, edited_at: new Date().toISOString() } : m));
    setEditingId(null);
    try {
      await api.chat.editMessage(msgId, body);
    } catch (e) {
      console.error(e);
      if (activeConvId) loadMessages(activeConvId);
    }
  };

  const handleDelete = async (msgId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    try {
      await api.chat.deleteMessage(msgId);
      loadConversations();
    } catch (e) {
      console.error(e);
      if (activeConvId) loadMessages(activeConvId);
    }
  };

  const filtered = conversations.filter((c) => {
    if (filter === "open" && c.status !== "open") return false;
    if (filter === "closed" && c.status !== "closed") return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.member_name || "").toLowerCase().includes(s) || (c.member_no || "").toLowerCase().includes(s) || (c.subject || "").toLowerCase().includes(s);
    }
    return true;
  });

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <div className="h-[calc(100vh-6rem)] flex gap-0 border rounded-xl overflow-hidden bg-background">
      <div className="w-80 border-r flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="MessageCircle" size={20} className="text-primary" />
            <span className="font-semibold text-sm">Чаты</span>
            {totalUnread > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 h-5">{totalUnread}</Badge>}
          </div>
          <div className="relative">
            <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по пайщику..." className="pl-8 h-8 text-sm" />
          </div>
          <div className="flex gap-1">
            {(["all", "open", "closed"] as const).map((f) => (
              <Button key={f} variant={filter === f ? "default" : "ghost"} size="sm" className="h-7 text-xs flex-1" onClick={() => setFilter(f)}>
                {f === "all" ? "Все" : f === "open" ? "Открытые" : "Закрытые"}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Нет чатов</div>
          ) : (
            <div className="divide-y">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveConvId(c.id)}
                  className={`w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors ${activeConvId === c.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon name="User" size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-medium truncate">{c.member_name}</span>
                        {c.unread_count > 0 && <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0">{c.unread_count}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{c.member_no}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message || "Нет сообщений"}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.status === "open" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {c.status === "open" ? "Открыт" : "Закрыт"}
                        </span>
                        {c.ai_enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">ИИ</span>}
                        {c.last_message_at && <span className="text-[10px] text-muted-foreground">{new Date(c.last_message_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!activeConvId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Icon name="MessageCircle" size={48} className="mx-auto mb-3 opacity-20" />
              <div className="text-sm">Выберите чат слева</div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{activeConv?.member_name} <span className="text-muted-foreground font-normal">#{activeConv?.member_no}</span></div>
                <div className="text-xs text-muted-foreground truncate">{activeConv?.subject || "Обращение"}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5" title="ИИ-агент">
                  <Icon name="Bot" size={14} className={activeConv?.ai_enabled ? "text-violet-500" : "text-muted-foreground"} />
                  <Switch checked={activeConv?.ai_enabled || false} onCheckedChange={(v) => handleToggleAi(activeConvId, v)} className="scale-75" />
                </div>
                {activeConv?.status === "open" ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleClose(activeConvId)}>
                    <Icon name="CheckCircle" size={12} />
                    Закрыть
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleReopen(activeConvId)}>
                    <Icon name="RotateCcw" size={12} />
                    Открыть
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">Нет сообщений</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isClient = m.sender_type === "client";
                    const isAi = m.sender_type === "ai";
                    const isStaff = m.sender_type === "staff";
                    const isEditing = editingId === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isClient ? "justify-start" : "justify-end"}`}
                        onMouseEnter={() => setHoveredId(m.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <div className="flex flex-col gap-0.5 max-w-[70%]">
                          <div className={`rounded-2xl px-3.5 py-2.5 ${isClient ? "bg-muted" : isAi ? "bg-violet-50 border border-violet-200" : "bg-primary text-white"}`}>
                            <div className={`text-[10px] font-medium mb-1 ${isClient ? "text-muted-foreground" : isAi ? "text-violet-600" : "text-white/70"}`}>
                              {isClient ? "Пайщик" : isAi ? "ИИ-помощник" : m.sender_name || "Менеджер"}
                            </div>
                            {isEditing ? (
                              <div className="flex gap-1.5 items-end">
                                <textarea
                                  className="text-sm bg-white/20 text-inherit rounded p-1 resize-none w-full min-h-[56px] outline-none border border-white/30"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(m.id); } if (e.key === "Escape") setEditingId(null); }}
                                  autoFocus
                                />
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button onClick={() => handleEditSave(m.id)} className="p-1 rounded bg-white/20 hover:bg-white/30"><Icon name="Check" size={13} /></button>
                                  <button onClick={() => setEditingId(null)} className="p-1 rounded bg-white/20 hover:bg-white/30"><Icon name="X" size={13} /></button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                            )}
                            <div className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isClient ? "text-muted-foreground/60" : isAi ? "text-violet-400" : "text-white/60"}`}>
                              {m.edited_at && <span className="italic">изм.</span>}
                              {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          {isStaff && hoveredId === m.id && !isEditing && (
                            <div className="flex gap-1 justify-end px-1">
                              <button onClick={() => handleEditStart(m)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Редактировать">
                                <Icon name="Pencil" size={11} />
                              </button>
                              <button onClick={() => handleDelete(m.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors" title="Удалить">
                                <Icon name="Trash2" size={11} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {activeConv?.status === "closed" ? (
              <div className="px-4 py-3 border-t text-center text-sm text-muted-foreground">Чат закрыт</div>
            ) : (
              <div className="px-3 py-2 border-t flex gap-2 shrink-0">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ответить пайщику..."
                  className="flex-1"
                  disabled={sending}
                />
                <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending}>
                  {sending ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Chats;
