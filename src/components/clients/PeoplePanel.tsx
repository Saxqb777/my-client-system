"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MoreHorizontal, Pencil, Phone, Star, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Person } from "@/lib/db/schema";
import { createPersonAction, deletePersonAction, updatePersonAction } from "@/actions/people";
import { initials } from "@/lib/core/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/aurora/EmptyState";

type Form = { name: string; role: string; side: Person["side"]; email: string; phone: string; isPrimary: boolean };
const empty: Form = { name: "", role: "", side: "client", email: "", phone: "", isPrimary: false };

export function PeoplePanel({ clientId, people }: { clientId: string; people: Person[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Person | null | "new">(null);
  const [form, setForm] = useState<Form>(empty);

  function openNew() {
    setForm(empty);
    setEditing("new");
  }
  function openEdit(p: Person) {
    setForm({ name: p.name, role: p.role ?? "", side: p.side, email: p.email ?? "", phone: p.phone ?? "", isPrimary: p.isPrimary });
    setEditing(p);
  }

  function save() {
    start(async () => {
      const payload = { ...form, clientId };
      const res = editing === "new" ? await createPersonAction(payload) : await updatePersonAction((editing as Person).id, payload);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(editing === "new" ? "Person added" : "Saved");
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{people.length} people</p>
        <Button size="sm" variant="secondary" onClick={openNew}>
          <UserPlus /> Add person
        </Button>
      </div>
      {people.length === 0 ? (
        <EmptyState title="No people yet" hint="Add the key contacts: sponsor, IT lead, vendor PM." compact />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id} className="glass-inset flex items-start gap-3 p-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--violet),var(--magenta))] text-xs font-semibold text-white">{initials(p.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {p.name}
                  {p.isPrimary && <Star className="size-3.5 fill-warn text-warn" />}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span>{p.role || "Role not set"}</span>
                  <Badge className="!py-0 !text-[10px]">{p.side}</Badge>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[12px]">
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-teal hover:underline">
                      <Mail className="size-3" /> {p.email}
                    </a>
                  )}
                  {p.phone && (
                    <a href={`https://wa.me/${p.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal hover:underline">
                      <Phone className="size-3" /> {p.phone}
                    </a>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Options">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openEdit(p)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    danger
                    onSelect={() =>
                      start(async () => {
                        const res = await deletePersonAction(p.id);
                        if (!res.ok) toast.error(res.error);
                        else router.refresh();
                      })
                    }
                  >
                    <Trash2 /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add person" : "Edit person"}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="IT Manager" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Side</Label>
                <Select value={form.side} onValueChange={(v) => setForm({ ...form, side: v as Person["side"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch checked={form.isPrimary} onCheckedChange={(v) => setForm({ ...form, isPrimary: v })} id="primary" />
                <Label htmlFor="primary">Primary contact</Label>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone / WhatsApp</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 50 000 0000" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.name.trim()}>
              {pending && <Loader2 className="animate-spin" />} {editing === "new" ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
