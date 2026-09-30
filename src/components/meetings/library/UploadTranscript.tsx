"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import { uploadTranscriptAction } from "@/actions/meetingIntel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropOverlay, useWindowFileDrop } from "@/components/meetings/FileDrop";
import { TRANSCRIPT_ACCEPT, titleFromFileName, transcriptFileProblem } from "@/lib/meetings/transcriptFile";

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Manual fallback for a transcript that did not arrive by itself: paste it, pick a Teams file, or drop one anywhere on the page. */
export function UploadTranscript({ clients }: { clients: NavClient[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState("auto");
  const [title, setTitle] = useState("");
  const [heldAt, setHeldAt] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  /** True while the title came from the file name, so the next file may replace it. */
  const [titleFromFile, setTitleFromFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function takeFile(next: File | undefined) {
    if (!next || pending) return;
    const problem = transcriptFileProblem(next.name, next.size);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(next);
    if (!title.trim() || titleFromFile) {
      setTitle(titleFromFileName(next.name));
      setTitleFromFile(true);
    }
    setOpen(true);
  }

  function clearFile() {
    setFile(null);
    if (titleFromFile) setTitle("");
    setTitleFromFile(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const dragging = useWindowFileDrop((files) => {
    if (files.length > 1) toast.message("One transcript at a time. Orbit took the first file.");
    takeFile(files[0]);
  });

  function submit() {
    const fd = new FormData();
    fd.set("clientId", clientId === "auto" ? "" : clientId);
    fd.set("title", title);
    fd.set("heldAt", heldAt);
    fd.set("text", text);
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
      clearFile();
      router.push(`/meetings/${res.data.meetingId}`);
    });
  }

  return (
    <>
      <DropOverlay show={dragging} title="Drop the transcript" hint="Orbit reads .vtt, .srt, .txt, .md and .docx files up to 4 MB. The title comes from the file name; you can change it before sending." />
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Upload /> Add a transcript
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Add a transcript</DialogTitle>
            <DialogDescription>Paste the text, choose a Teams file or drop one anywhere on this page (.vtt, .srt, .txt, .md, .docx up to 4 MB). Orbit matches the client unless you pick one.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleFromFile(false);
                  }}
                  placeholder="Leave empty and Orbit names it"
                />
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
              <Label className="block">Held at (Dubai time), optional</Label>
              <Input type="datetime-local" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} className="sm:w-[240px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Transcript</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={file ? "The file is used. Anything pasted here is ignored while a file is chosen." : "Paste here, or drop a file anywhere on the page"}
                className="min-h-[180px] font-mono text-[12.5px] leading-relaxed"
                disabled={Boolean(file)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept={TRANSCRIPT_ACCEPT} className="hidden" onChange={(e) => takeFile(e.target.files?.[0])} />
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                  Choose a file
                </Button>
                {file ? (
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-text-2">
                    <span className="truncate">{file.name}</span>
                    <span className="num shrink-0 text-muted">{fileSize(file.size)}</span>
                    <button type="button" onClick={clearFile} className="shrink-0 text-muted hover:text-text" aria-label="Remove the file">
                      <X className="size-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="text-[12px] text-muted">No file chosen</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || (text.trim().length < 40 && !file)} onClick={submit}>
              {pending && <Loader2 className="animate-spin" />} Send to Orbit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
