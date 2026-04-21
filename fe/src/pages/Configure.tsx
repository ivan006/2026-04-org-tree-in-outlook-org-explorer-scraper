import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function DangerHint({ message }: { message: string }) {
  return (
    <p className="text-xs text-destructive flex items-center gap-1">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {message}
    </p>
  );
}

export default function Configure() {
  const navigate = useNavigate();

  const rootId = sessionStorage.getItem("scraper_root_id") ?? "";

  const [rootOverride, setRootOverride] = useState(rootId);
  const [depthLimit, setDepthLimit] = useState<number>(0);
  const [requestDelay, setRequestDelay] = useState<number>(300);
  const [batchSize, setBatchSize] = useState<number>(50);
  const [skipExisting, setSkipExisting] = useState(true);

  const depthDanger = depthLimit === 0;
  const delayDanger = requestDelay < 200;
  const batchDanger = batchSize > 100;

  function handleStart() {
    if (!sessionStorage.getItem("scraper_token")) {
      toast.error("No token found — go back and paste your curl.");
      return;
    }

    sessionStorage.setItem(
      "scraper_config",
      JSON.stringify({
        rootId: rootOverride.trim() || rootId,
        depthLimit,
        requestDelay,
        batchSize,
        skipExisting,
      }),
    );

    navigate("/scrape");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Configure scrape
          </h1>
          <p className="text-muted-foreground text-sm">
            Tune how the scraper traverses and stores the org tree.
          </p>
        </div>

        {/* Root person */}
        <div className="space-y-2">
          <Label>Root person ID</Label>
          <Input
            value={rootOverride}
            onChange={(e) => setRootOverride(e.target.value)}
            placeholder="aadObjectId to start from"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Defaults to the person in your curl. Override to start from a
            different node.
          </p>
        </div>

        <Separator />

        {/* Depth limit */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className={cn(depthDanger && "text-destructive")}>
              Depth limit
            </Label>
            <span
              className={cn(
                "text-sm font-mono",
                depthDanger
                  ? "text-destructive font-medium"
                  : "text-muted-foreground",
              )}
            >
              {depthLimit === 0 ? "unlimited" : depthLimit}
            </span>
          </div>
          <Slider
            min={0}
            max={10}
            step={1}
            value={[depthLimit]}
            onValueChange={([v]) => setDepthLimit(v)}
            className={cn(
              depthDanger &&
                "[&_[role=slider]]:border-destructive [&_[role=slider]]:bg-destructive",
            )}
          />
          {depthDanger ? (
            <DangerHint message="Unlimited depth may fire hundreds of requests and take a long time." />
          ) : (
            <p className="text-xs text-muted-foreground">
              How many levels deep to recurse. 0 = unlimited (full tree).
            </p>
          )}
        </div>

        <Separator />

        {/* Request delay */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className={cn(delayDanger && "text-destructive")}>
              Delay between requests
            </Label>
            <span
              className={cn(
                "text-sm font-mono",
                delayDanger
                  ? "text-destructive font-medium"
                  : "text-muted-foreground",
              )}
            >
              {requestDelay}ms
            </span>
          </div>
          <Slider
            min={100}
            max={2000}
            step={100}
            value={[requestDelay]}
            onValueChange={([v]) => setRequestDelay(v)}
            className={cn(
              delayDanger &&
                "[&_[role=slider]]:border-destructive [&_[role=slider]]:bg-destructive",
            )}
          />
          {delayDanger ? (
            <DangerHint message="Delays under 200ms are likely to trigger rate limiting." />
          ) : (
            <p className="text-xs text-muted-foreground">
              Pause between API calls. Increase if you hit rate limits.
            </p>
          )}
        </div>

        <Separator />

        {/* Batch size */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className={cn(batchDanger && "text-destructive")}>
              Supabase insert batch size
            </Label>
            <span
              className={cn(
                "text-sm font-mono",
                batchDanger
                  ? "text-destructive font-medium"
                  : "text-muted-foreground",
              )}
            >
              {batchSize}
            </span>
          </div>
          <Slider
            min={10}
            max={200}
            step={10}
            value={[batchSize]}
            onValueChange={([v]) => setBatchSize(v)}
            className={cn(
              batchDanger &&
                "[&_[role=slider]]:border-destructive [&_[role=slider]]:bg-destructive",
            )}
          />
          {batchDanger ? (
            <DangerHint message="Large batches may hit Supabase row limits. Consider lowering to 50-100." />
          ) : (
            <p className="text-xs text-muted-foreground">
              How many records to insert at once.
            </p>
          )}
        </div>

        <Separator />

        {/* Skip existing */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Skip existing records</Label>
            <p className="text-xs text-muted-foreground">
              If a person is already in Supabase, skip them instead of updating.
            </p>
          </div>
          <Switch checked={skipExisting} onCheckedChange={setSkipExisting} />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate("/")}>
            ← Back
          </Button>
          <Button onClick={handleStart}>Start scrape →</Button>
        </div>
      </div>
    </div>
  );
}
