import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Send, Shield, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/group")({
  component: GroupPage,
});

type ProfileLite = { id: string; name: string; photo_url: string | null; role: string | null };
type Group = { id: string; name: string; description: string | null; send_permission: string | null };
type MessageRow = {
  id: string;
  group_id: string;
  sender_profile_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  is_deleted: boolean | null;
  created_at: string | null;
};
type MessageView = MessageRow & { sender?: ProfileLite; signedMediaUrl?: string | null };

function GroupPage() {
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => !!group && !!profile && !sending, [group, profile, sending]);

  const signMedia = async (rows: MessageRow[]) => {
    const signed = await Promise.all(rows.map(async (message) => {
      if (!message.media_url) return { ...message, signedMediaUrl: null };
      const { data } = await supabase.storage.from("group-media").createSignedUrl(message.media_url, 60 * 60);
      return { ...message, signedMediaUrl: data?.signedUrl || null };
    }));
    return signed;
  };

  const hydrateMessages = async (rows: MessageRow[]) => {
    const profileIds = [...new Set(rows.map((row) => row.sender_profile_id))];
    const { data: profiles } = profileIds.length
      ? await supabase.from("profiles").select("id,name,photo_url,role").in("id", profileIds)
      : { data: [] };
    const profileMap = new Map(((profiles as ProfileLite[]) || []).map((item) => [item.id, item]));
    const signed = await signMedia(rows);
    return signed.map((row) => ({ ...row, sender: profileMap.get(row.sender_profile_id) }));
  };

  const loadMessages = async (groupId: string) => {
    const { data } = await supabase
      .from("group_messages")
      .select("id,group_id,sender_profile_id,content,media_url,media_type,is_deleted,created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(120);
    setMessages(await hydrateMessages((data as MessageRow[]) || []));
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setAccessError("Faça login para acessar o grupo.");
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id,name,photo_url,role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!profileData?.id) {
        setAccessError("Perfil não encontrado.");
        setLoading(false);
        return;
      }
      setProfile(profileData as ProfileLite);

      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("profile_id", profileData.id)
        .limit(1);

      let selectedGroupId = memberships?.[0]?.group_id as string | undefined;
      if (!selectedGroupId) {
        const { data: firstGroup } = await supabase
          .from("challenge_groups")
          .select("id")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstGroup?.id) {
          const { error } = await supabase.rpc("join_student_challenge_group" as never, { _group_id: firstGroup.id } as never);
          if (error) setAccessError(error.message);
          else selectedGroupId = firstGroup.id;
        }
      }

      if (selectedGroupId) {
        const [{ data: groupData }, countRes] = await Promise.all([
          supabase.from("challenge_groups").select("id,name,description,send_permission").eq("id", selectedGroupId).maybeSingle(),
          supabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", selectedGroupId),
        ]);
        setGroup(groupData as Group | null);
        setMemberCount(countRes.count || 0);
        await loadMessages(selectedGroupId);
      } else if (!accessError) {
        setAccessError("Nenhum grupo ativo foi encontrado.");
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!group?.id) return;
    const channel = supabase
      .channel(`group-messages-${group.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, async () => {
        await loadMessages(group.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [group?.id]);

  const sendMessage = async (mediaPath?: string, mediaType?: string) => {
    if (!canSend || (!draft.trim() && !mediaPath) || !profile || !group) return;
    setSending(true);
    const content = draft.trim() || null;
    setDraft("");
    const { error } = await supabase.from("group_messages").insert({
      group_id: group.id,
      sender_profile_id: profile.id,
      content,
      media_url: mediaPath || null,
      media_type: mediaType || null,
    } as never);
    setSending(false);
    if (error) toast.error(error.message);
  };

  const uploadMedia = async (file: File) => {
    if (!group || !profile) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    setSending(true);
    const path = `${group.id}/${profile.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const { error } = await supabase.storage.from("group-media").upload(path, file, { contentType: file.type, upsert: false });
    setSending(false);
    if (error) toast.error(error.message);
    else await sendMessage(path, "image");
  };

  const deleteMessage = async (message: MessageView) => {
    const { error } = await supabase.from("group_messages").update({ is_deleted: true, content: null } as never).eq("id", message.id);
    if (error) toast.error(error.message);
  };

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!group) return (
    <div className="flex flex-col gap-4 p-4">
      <header className="pt-2"><h1 className="text-2xl font-bold text-foreground">Grupo</h1></header>
      <div className="rounded-2xl bg-card p-6 text-center">
        <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-bold text-foreground">Acesso ao grupo indisponível</p>
        <p className="mt-1 text-xs text-muted-foreground">{accessError || "Ative um desafio para entrar no grupo."}</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20"><Users className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{group.name}</p>
          <p className="text-[11px] text-muted-foreground">{memberCount} participantes • mensagens ao vivo</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center text-xs text-muted-foreground">Nenhuma mensagem ainda. Seja o primeiro a falar no grupo.</div>
        ) : messages.map((message) => {
          const isMine = message.sender_profile_id === profile?.id;
          const isCoach = message.sender?.role === "coach" || message.sender?.role === "admin";
          return (
            <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${isMine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground"}`}>
                {!isMine && <p className={`mb-0.5 text-[11px] font-bold ${isCoach ? "text-primary" : "text-muted-foreground"}`}>{message.sender?.name || "Participante"}{isCoach ? " • Coach" : ""}</p>}
                {message.is_deleted ? <p className="text-sm italic opacity-60">Mensagem apagada</p> : (
                  <>
                    {message.signedMediaUrl && <img src={message.signedMediaUrl} alt="Mídia enviada no grupo" className="mb-2 max-h-64 w-full rounded-xl object-cover" />}
                    {message.content && <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
                  </>
                )}
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className={`text-[9px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{message.created_at ? new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                  {isMine && !message.is_deleted && <button onClick={() => deleteMessage(message)} className="opacity-60 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2 rounded-full bg-muted py-1.5 pl-4 pr-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0])} />
          <button onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-foreground"><ImageIcon className="h-5 w-5" /></button>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Mensagem..." className="flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          <button disabled={!draft.trim() || sending} onClick={() => sendMessage()} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> : <Send className="h-4 w-4 text-primary-foreground" />}
          </button>
        </div>
      </div>
    </div>
  );
}
