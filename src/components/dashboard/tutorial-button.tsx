"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ExerciseGuide } from "@/lib/types";
import { workoutGuideFor } from "@/lib/workout-plan";
import { guideSourceUrl, isExerciseSourceUrl, videoEmbedUrl, videoWatchUrl } from "@/lib/exercise-video";

const msSearch = (title: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:muscleandstrength.com/exercises ${title}`)}`;

export function TutorialButton({
  url,
  title,
  guideUrl = null,
  guide: storedGuide = null,
  itemId,
  autoImport = true,
}: {
  url: string | null;
  title: string;
  guideUrl?: string | null;
  guide?: ExerciseGuide | null;
  itemId?: string;
  autoImport?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState<ExerciseGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const matched = useMemo(() => workoutGuideFor(title), [title]);
  const guide = imported ?? (storedGuide && "video_url" in storedGuide ? storedGuide : matched.guide ?? storedGuide);
  const sourceUrl = matched.guide_url ?? guideUrl ?? guide?.source_url ?? null;
  const sourceLink = guideSourceUrl(sourceUrl);
  const video = videoEmbedUrl(guide?.video_url ?? url);

  useEffect(() => {
    setImported(null);
    setError("");
  }, [title, guideUrl]);

  useEffect(() => {
    if (!autoImport || !open || video || !isExerciseSourceUrl(sourceUrl)) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/workout/guide", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, guideUrl: sourceUrl, itemId }), signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Guide import failed.");
      if (controller.signal.aborted) return;
      if (result.guide) setImported(result.guide);
      else setError(result.reason ?? "No playable video was found. Add a verified video in Edit exercise.");
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Guide import failed.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [autoImport, open, video, sourceUrl, title, itemId]);

    return (
      <>
        <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)} aria-label={`Form guide for ${title}`}>
          <BookOpenCheck className="size-3.5" />
          Guide
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {[guide?.target, guide?.equipment].filter(Boolean).join(" · ") || "Form guide"}
              </DialogDescription>
            </DialogHeader>
            {guide?.description && <p className="text-sm text-muted-foreground">{guide.description}</p>}
            {open && video && <div className="aspect-video overflow-hidden rounded-xl border bg-black">
              <iframe src={video} title={`${title} exercise demonstration`} className="h-full w-full"
                allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin" />
            </div>}
            {loading && <p role="status" className="text-sm text-muted-foreground">Importing the exercise video and instructions…</p>}
            {!video && !loading && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {error || "No verified in-app video is available yet. Use the official guide below, or add a verified video in Edit exercise."}
            </p>}
            {!guide?.cues?.length && guideUrl && (
              <p className="text-sm text-muted-foreground">Use the exercise-specific Muscle &amp; Strength page for its technique instructions and demonstration video.</p>
            )}
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
              href={sourceLink ?? msSearch(title)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: guideUrl ? "default" : "outline", size: "sm" }), "w-full")}
            >
              <ExternalLink className="size-3.5" />
              {isExerciseSourceUrl(sourceUrl) ? "Full guide on Muscle & Strength" : sourceLink ? "Original guide / video source" : "Search Muscle & Strength"}
            </a>
            {video && <a href={videoWatchUrl(video)!} target="_blank" rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}><ExternalLink className="size-3.5" /> Open video on its provider</a>}
            {video && <p className="text-xs text-muted-foreground">Press play to watch. If the provider blocks playback here, open its official guide above. Stop if an exercise causes pain.</p>}
          </DialogContent>
        </Dialog>
      </>
    );
}
