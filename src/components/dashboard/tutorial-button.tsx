import { CirclePlay, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TutorialButton({ url, title }: { url: string | null; title: string }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          buttonVariants({ variant: "outline", size: "xs" }),
          "border-red-500/50 text-red-300 hover:bg-red-500/15 hover:text-red-200",
        )}
      >
        <CirclePlay className="size-3.5" />
        Tutorial
      </a>
    );
  }
  return (
    <a
      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} exercise form`)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="No tutorial saved — search YouTube"
      className={cn(buttonVariants({ variant: "ghost", size: "xs" }), "text-muted-foreground")}
    >
      <Search className="size-3.5" />
      Find
    </a>
  );
}
