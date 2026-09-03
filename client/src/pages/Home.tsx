import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, BrainCircuit, Check, ChevronDown, Globe2, ImagePlus, Link2, Menu, Mic, Paperclip, Plus, Sparkles, UserRound, Video, WandSparkles, X } from "lucide-react";

type Source = { title: string; uri: string };
type Message = { id: number; role: "assistant" | "user"; text: string; time: string; grounded?: boolean; sources?: Source[]; attachment?: string; imageKey?: string; media?: "image" | "video"; mediaUrl?: string };

const initialMessages: Message[] = [
  { id: 1, role: "assistant", text: "שלום, אני DubiAi — סביבת העבודה האישית שלך עם AI.\n\nאיך אפשר לעזור לך היום? אפשר לשאול שאלה, לנתח תמונה, לחפש מידע עדכני או ליצור מדיה.", time: "09:41" },
  { id: 2, role: "assistant", text: "אפשר להתחיל עם אחת מהפעולות המהירות למטה, או פשוט לכתוב לי מה צריך.", time: "09:41" },
];
const suggestions = ["סכם לי את החדשות החשובות היום", "נתח את התמונה המצורפת", "צור לי תמונה של שקיעה במדבר", "מצא קופונים פעילים ל־Airbnb"];

const nowTime = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

async function uploadAttachment(dataUrl: string, fileName: string | null) {
  const blob = await fetch(dataUrl).then(response => response.blob());
  const response = await fetch("/api/upload-image", { method: "POST", headers: { "content-type": blob.type, "x-file-name": fileName ?? "upload" }, body: blob });
  if (!response.ok) throw new Error("העלאת התמונה נכשלה");
  return await response.json() as { key: string; url: string };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [activeAction, setActiveAction] = useState<"image" | "video" | null>(null);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chat = trpc.ai.chat.useMutation();
  const imageGeneration = trpc.ai.generateImage.useMutation();
  const imageEdit = trpc.ai.editImage.useMutation();
  const videoGeneration = trpc.ai.generateVideo.useMutation();
  const isThinking = chat.isPending || imageGeneration.isPending || imageEdit.isPending || videoGeneration.isPending;

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [messages, isThinking]);

  const addAssistant = (text: string, extra: Partial<Message> = {}) => setMessages(items => [...items, { id: Date.now() + 1, role: "assistant", text, time: nowTime(), ...extra }]);

  const send = async (preset?: string) => {
    const text = (preset ?? draft).trim();
    if ((!text && !attachment) || isThinking) return;
    const currentAttachment = attachment;
    const userMessageId = Date.now();
    setMessages(items => [...items, { id: userMessageId, role: "user", text: text || "בדוק את הקובץ המצורף", time: nowTime(), attachment: currentAttachment ?? undefined }]);
    setDraft(""); setAttachment(null); setAttachmentName(null);
    try {
      const uploaded = currentAttachment ? await uploadAttachment(currentAttachment, attachmentName) : null;
      if (uploaded) setMessages(items => items.map(message => message.id === userMessageId ? { ...message, imageKey: uploaded.key } : message));
      if (activeAction === "image") {
        const result = uploaded ? await imageEdit.mutateAsync({ prompt: text || "שפר את התמונה בעדינות", imageKey: uploaded.key }) : await imageGeneration.mutateAsync({ prompt: text });
        addAssistant("המדיה מוכנה. היא נשמרת כאן כחלק מהשיחה שלך.", { media: "image", mediaUrl: result.url });
      } else if (activeAction === "video") {
        const result = await videoGeneration.mutateAsync({ prompt: text });
        addAssistant("הווידאו מוכן. אפשר לצפות בו ישירות מתוך השיחה.", { media: "video", mediaUrl: result.url });
      } else {
        const history = messages.filter(m => m.role === "user" || m.role === "assistant").map(({ role, text: messageText, imageKey }) => ({ role, text: messageText, ...(imageKey ? { imageKey } : {}) }));
        const result = await chat.mutateAsync({ grounded: searchMode, messages: [...history, { role: "user" as const, text: text || "נתח את התמונה המצורפת", ...(uploaded ? { imageKey: uploaded.key } : {}) }].slice(-24) });
        addAssistant(result.text, { grounded: result.grounded, sources: result.sources });
      }
    } catch (error) {
      addAssistant(error instanceof Error ? `לא הצלחתי להשלים את הבקשה: ${error.message}` : "לא הצלחתי להשלים את הבקשה כרגע.");
    } finally { setActiveAction(null); }
  };

  const chooseFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => { setAttachment(String(reader.result)); setAttachmentName(file.name); };
    reader.readAsDataURL(file);
  };

  return <div dir="rtl" className="workspace-shell">
    <aside className="workspace-sidebar">
      <div className="brand-lockup"><div className="brand-mark"><Sparkles size={18} /></div><div><strong>DubiAi</strong><span>AI WORKSPACE</span></div></div>
      <Button className="new-chat" onClick={() => setMessages(initialMessages)}><Plus size={16} /> שיחה חדשה <span>⌘ K</span></Button>
      <div className="sidebar-section"><span className="eyebrow">סביבת עבודה</span><button className="side-link active"><BrainCircuit size={17} /> צ׳אט חכם <Badge>פעיל</Badge></button><button className="side-link" onClick={() => setActiveAction("image")}><ImagePlus size={17} /> סטודיו תמונות</button><button className="side-link" onClick={() => setActiveAction("video")}><Video size={17} /> יצירת וידאו</button></div>
      <div className="sidebar-section history"><span className="eyebrow">שיחות אחרונות</span><button className="history-item">תכנון טיול ליפן <small>היום</small></button><button className="history-item">קמפיין קיץ 2025 <small>אתמול</small></button><button className="history-item">רעיונות לתוכן <small>12 ביוני</small></button></div>
      <div className="sidebar-bottom"><div className="usage-row"><span>שימוש חודשי</span><strong>24%</strong></div><div className="usage-track"><i /></div><div className="profile"><span className="avatar">נ</span><span><b>המרחב שלך</b><small>גישה פתוחה</small></span><ChevronDown size={15} /></div></div>
    </aside>
    <main className="chat-panel">
      <header className="chat-header"><div className="mobile-brand"><div className="brand-mark"><Sparkles size={17} /></div><strong>DubiAi</strong></div><div className="model-select"><span className="status-dot" /> Gemini Flash Latest <ChevronDown size={14} /></div><div className="header-actions"><span className="secure-label"><Check size={14} /> מאובטח</span><button className="icon-button mobile-menu"><Menu size={19} /></button><button className="icon-button"><span className="help-dot">?</span></button></div></header>
      <div className="conversation" ref={feedRef}><div className="date-divider"><span>היום, 03 בספטמבר 2026</span></div>{messages.map(message => <div key={message.id} className={`message-row ${message.role}`}><div className={`message-avatar ${message.role}`}>{message.role === "assistant" ? <Sparkles size={15} /> : <UserRound size={15} />}</div><div className="message-stack"><div className="message-meta"><strong>{message.role === "assistant" ? "DubiAi" : "אתה"}</strong><time>{message.time}</time>{message.grounded && <span className="grounded"><Globe2 size={12} /> מבוסס חיפוש</span>}</div><div className="message-bubble">{message.attachment && <div className="attachment-card"><img src={message.attachment} alt="קובץ מצורף" /><span>{attachmentName ?? "תמונה לניתוח"}</span></div>}<p>{message.text}</p>{message.media && message.mediaUrl && <div className={`media-result ${message.media}`}>{message.media === "image" ? <img src={message.mediaUrl} alt="תוצאה שנוצרה" /> : <video src={message.mediaUrl} controls playsInline />}</div>}{message.sources && message.sources.length > 0 && <div className="sources"><span><Globe2 size={12} /> מקורות שנבדקו</span>{message.sources.slice(0, 3).map(source => <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer">{source.title}<Link2 size={11} /></a>)}</div>}</div></div></div>)}{isThinking && <div className="message-row assistant"><div className="message-avatar assistant"><Sparkles size={15} /></div><div className="thinking"><span /><span /><span /></div></div>}<div className="suggestion-grid">{suggestions.map(item => <button key={item} onClick={() => send(item)}>{item}<ArrowUp size={14} /></button>)}</div></div>
      <div className="composer-wrap"><div className="composer-tools"><button className={`tool-toggle ${searchMode ? "selected" : ""}`} onClick={() => setSearchMode(!searchMode)}><Globe2 size={16} /> חיפוש באינטרנט <span className="toggle-pill"><i /></span></button><span className="composer-hint">מידע עדכני ומקורות</span></div><div className="composer"><div className="composer-top">{attachment && <div className="preview-chip"><img src={attachment} alt="תצוגה מקדימה" /><span>{attachmentName}</span><button onClick={() => { setAttachment(null); setAttachmentName(null); }}><X size={12} /></button></div>}{activeAction && <div className="action-chip"><WandSparkles size={13} /> {activeAction === "image" ? "יצירת תמונה" : "יצירת וידאו"}<button onClick={() => setActiveAction(null)}><X size={12} /></button></div>}</div><Textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="כתוב הודעה לDubiAi..." /><div className="composer-footer"><div className="composer-actions"><input ref={fileRef} type="file" accept="image/*" hidden onChange={e => chooseFile(e.target.files?.[0])} /><button onClick={() => fileRef.current?.click()} aria-label="צרף תמונה"><Paperclip size={18} /></button><button onClick={() => setActiveAction("image")} aria-label="צור תמונה"><ImagePlus size={18} /></button><button onClick={() => setActiveAction("video")} aria-label="צור וידאו"><Video size={18} /></button></div><div className="composer-right"><span>Enter לשליחה · Shift + Enter לשורה חדשה</span><button className="mic-button" aria-label="הקלטה"><Mic size={17} /></button><button className="send-button" onClick={() => void send()} disabled={(!draft.trim() && !attachment) || isThinking}><ArrowUp size={18} /></button></div></div></div><p className="privacy-note"><Link2 size={12} /> המידע שלך פרטי ומאובטח. מפתחות API נשארים בשרת.</p></div>
    </main>
    <div className="right-rail"><div className="rail-card"><span className="eyebrow">מצב מערכת</span><div className="system-status"><i /> כל המערכות פעילות</div><div className="rail-stat"><span>זמן תגובה ממוצע</span><strong>1.2s</strong></div><div className="rail-stat"><span>מודל פעיל</span><strong>Gemini Flash</strong></div></div><div className="rail-card tips"><span className="eyebrow">טיפ קטן</span><h3>תן לי הקשר, ואחזיר תוצאה טובה יותר.</h3><p>אפשר לצרף תמונה, לבחור חיפוש או לבקש ממני ליצור משהו חדש.</p></div></div>
  </div>;
}
