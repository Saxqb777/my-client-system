import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-5 lg:grid-cols-12">
        <Skeleton className="h-[420px] rounded-[20px] lg:col-span-7" />
        <Skeleton className="h-[420px] rounded-[20px] lg:col-span-5" />
      </div>
    </div>
  );
}
