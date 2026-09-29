"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import { uploadTranscriptAction } from "@/actions/meetingIntel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Manual fallback for a transcript that did not arrive by itself: paste it or pick a Teams file. */
export function UploadTranscript({ clients }: { clients: NavClient[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState("auto");
  const [title, setTitle] = useState("");
  const [heldAt, setHeldAt] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    const fd = new FormData();
    fd.set("clientId", clientId === "auto" ? "" : clientId);
    fd.set("title", title);
    fd.set("heldAt", heldAt);
    fd.set("text", text);
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("file", file);
    start(async () => {
      const res = await uploadTranscriptAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.data.duplicate ? "That meeting is already in Orbit" : "Transcript received. Minutes are being drafted.");
      setOpen(false);
      setText("");
      setTitle("");
      setFileName("");
      router.push(`/meetings/${res.data.meetingId}`);
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Upload /> Add a transcript
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Add a transcript</DialogTitle>
            <DialogDescription>Paste the text or pick a Teams file (.vtt, .docx, .txt). Orbit matches the client unless you pick one.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave empty and Orbit names it" />
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Let Orbit match</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="other">Other Work</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Held at (Dubai time), optional</Label>
              <Input type="datetime-local" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} className="sm:w-[240px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Transcript</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here, or choose a file below" className="min-h-[180px] font-mono text-[12.5px] leading-relaxed" />
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept=".vtt,.srt,.txt,.md,.docx,text/plain,text/vtt" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                  Choose a file
                </Button>
                <span className="text-[12px] text-muted">{fileName || "No file chosen"}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || (text.trim().length < 40 && !fileName)} onClick={submit}>
              {pending && <Loader2 className="animate-spin" />} Send to Orbit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
