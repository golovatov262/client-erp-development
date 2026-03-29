import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { PushMessage, PushMessageLogEntry, PushSubscriber } from "@/lib/api";

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  draft: { label: "Черновик", variant: "secondary" },
  sending: { label: "Отправляется", variant: "secondary" },
  sent: { label: "Отправлено", variant: "default" },
  error: { label: "Ошибка", variant: "destructive" },
};

interface PushHistoryTabProps {
  messages: PushMessage[];
  subscribers: PushSubscriber[];
}

const PushHistoryTab = ({ messages, subscribers }: PushHistoryTabProps) => {
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<PushMessageLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const { toast } = useToast();

  const openLog = async (msgId: number) => {
    setLogLoading(true);
    setShowLog(true);
    try {
      const entries = await api.push.messageLog(msgId);
      setLogEntries(entries);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setLogLoading(false);
  };

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Рассылок пока нет</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Заголовок</TableHead>
                  <TableHead className="hidden sm:table-cell">Текст</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Доставлено</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map(m => {
                  const st = statusMap[m.status] || { label: m.status, variant: "secondary" as const };
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.sent_at || m.created_at)}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[150px] truncate">{m.title}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{m.body}</TableCell>
                      <TableCell><Badge variant={st.variant} className="text-xs">{st.label}</Badge></TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-green-600">{m.sent_count}</span>
                        {m.failed_count > 0 && <span className="text-red-500 ml-1">/ {m.failed_count}</span>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openLog(m.id)} title="Детали">
                          <Icon name="Eye" size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Детали рассылки</DialogTitle></DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-6"><Icon name="Loader2" size={24} className="animate-spin" /></div>
          ) : logEntries.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Нет записей</div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {logEntries.map(e => (
                <div key={e.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{e.user_name || `ID ${e.user_id}`}</div>
                    {e.error_text && <div className="text-xs text-red-500 mt-0.5">{e.error_text}</div>}
                  </div>
                  <Badge variant={e.status === "sent" ? "default" : "destructive"} className="text-xs">
                    {e.status === "sent" ? "Доставлено" : "Ошибка"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLog(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export { fmtDate };
export default PushHistoryTab;
