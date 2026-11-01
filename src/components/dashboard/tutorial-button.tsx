"use client";

import { useState } from "react";
import { BookOpenCheck, CirclePlay, ExternalLink, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ExerciseGuide } from "@/lib/types";

const msSearch = (title: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:muscleandstrength.com/exercises ${title}`)}`;

export function TutorialButton({
  url,
  title,
  guideUrl = null,
  guide = null,
}: {
  url: string | null;
  title: string;
  guideUrl?: string | null;
  guide?: ExerciseGuide | null;
}) {
  const [open, setOpen] = useState(false);

  if (guide || guideUrl) {
    return (
      <>
        <Button variant="outline" size="xs" onClick={() => setOpen(true)} aria-label={`Form guide for ${title}`}>
          <BookOpenCheck className="size-3.5" />
          Guide
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {[guide?.target, guide?.equipment].filter(Boolean).join(" · ") || "Form guide"}
              </DialogDescription>
            </DialogHeader>
            {!!guide?.secondary?.length && (
              <p className="text-sm">
                <span className="font-medium">Also works:</span> {guide.secondary.join(", ")}
              </p>
            )}
            {!!guide?.cues?.length && (
              <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
                {guide.cues.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            )}
            {guide?.tip && <p className="rounded-xl bg-muted p-3 text-sm">Tip: {guide.tip}</p>}
            <a
              href={guideUrl ?? msSearch(title)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: guideUrl ? "default" : "outline", size: "sm" }), "w-full")}
            >
              <ExternalLink className="size-3.5" />
              {guideUrl ? "Full guide on Muscle & Strength" : "Search Muscle & Strength"}
            </a>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "xs" }), "border-red-500/50 text-red-600 hover:bg-red-500/15 dark:text-red-300")}
      >
        <CirclePlay className="size-3.5" />
        Tutorial
      </a>
    );
  }
  return (
    <a
      href={msSearch(title)}
      target="_blank"
      rel="noopener noreferrer"
      title="No guide saved — search Muscle & Strength"
      className={cn(buttonVariants({ variant: "ghost", size: "xs" }), "text-muted-foreground")}
    >
      <Search className="size-3.5" />
      Find
    </a>
  );
}
