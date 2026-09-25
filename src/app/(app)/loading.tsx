import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-14 w-3/4" />
      <div className="grid gap-8 pt-6 lg:grid-cols-12">
        <Skeleton className="h-[420px] lg:col-span-7" />
        <Skeleton className="h-[420px] lg:col-span-5" />
      </div>
    </div>
  );
}
