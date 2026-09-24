import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/aurora/EmptyState";

export default function NotFound() {
  return (
    <div className="glass mx-auto mt-10 max-w-md">
      <EmptyState
        title="Nothing here"
        hint="The page or client you opened does not exist, or it was archived."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Back to Orbit</Link>
          </Button>
        }
      />
    </div>
  );
}
