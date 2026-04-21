import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

interface Person {
  aad_object_id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  department: string | null;
  location: string | null;
  manager_aad_object_id: string | null;
  is_manager: boolean;
  profile_picture_url: string | null;
  transitive_reports_count: number;
  direct_reports_count: number;
}

interface Config {
  rootId: string;
  depthLimit: number;
  requestDelay: number;
  batchSize: number;
  skipExisting: boolean;
}

type Status = "idle" | "running" | "paused" | "done" | "error";

const ENDPOINT =
  "https://zaf.loki.delve.office.com//api/v2/graphql?operationName=useOrgExplorerQueryRef_OrganizationQuery&ConvertSimpleRequest=POST";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCurlHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const matches = raw.matchAll(/-H '([^:]+): ([^']+)'/g);
  for (const m of matches) headers[m[1].toLowerCase()] = m[2];
  return headers;
}

async function fetchNode(
  aadObjectId: string,
  token: string,
  headers: Record<string, string>,
  bodyTemplate: Record<string, unknown>,
) {
  const body = {
    ...bodyTemplate,
    variables: {
      ...(bodyTemplate.variables as object),
      personIds: { aadObjectId },
    },
    __request_headers: {
      ...(bodyTemplate.__request_headers as object),
      authorization: `Bearer ${token}`,
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();

  console.log("RAW RESPONSE:", JSON.stringify(text.slice(0, 500)));

  // multipart response — find first JSON object after a Content-Type header
  const match = text.match(
    /Content-Type:\s*application\/json[^\r\n]*\r?\n\r?\n(\{.+?\})(?=\r?\n---|\r?\n$)/s,
  );
  if (!match) throw new Error("Could not find JSON in multipart response");
  return JSON.parse(match[1]);
}

function extractPersons(
  data: Record<string, unknown>,
  managerAadObjectId: string | null,
): { persons: Person[]; childIds: string[] } {
  const focus = (data?.data as Record<string, unknown>)?.orgexplorer as Record<
    string,
    unknown
  >;
  const p = focus?.personInFocusV2 as Record<string, unknown>;
  if (!p) return { persons: [], childIds: [] };

  const persons: Person[] = [];
  const childIds: string[] = [];

  // Add focus person
  persons.push({
    aad_object_id: p.aadObjectId as string,
    full_name: (p.fullName as string) ?? null,
    email: (p.email as string) ?? null,
    job_title: (p.jobTitle as string) ?? null,
    department: (p.department as string) ?? null,
    location: (p.location as string) ?? null,
    manager_aad_object_id: managerAadObjectId,
    is_manager: (p.isManager as boolean) ?? false,
    profile_picture_url: (p.profilePictureUrl as string) ?? null,
    transitive_reports_count: (p.transitiveReportsCount as number) ?? 0,
    direct_reports_count: (p.directReportsCount as number) ?? 0,
  });

  // Add level-1 directs and queue level-2 for recursion
  const directs =
    ((p.directs as Record<string, unknown>)?.edges as Record<
      string,
      unknown
    >[]) ?? [];
  for (const edge of directs) {
    const node = edge.node as Record<string, unknown>;
    if (!node?.aadObjectId) continue;

    persons.push({
      aad_object_id: node.aadObjectId as string,
      full_name: (node.fullName as string) ?? null,
      email: (node.email as string) ?? null,
      job_title: (node.jobTitle as string) ?? null,
      department: null,
      location: (node.location as string) ?? null,
      manager_aad_object_id: p.aadObjectId as string,
      is_manager: false,
      profile_picture_url: (node.profilePictureUrl as string) ?? null,
      transitive_reports_count: (node.transitiveReportsCount as number) ?? 0,
      direct_reports_count: (node.directReportsCount as number) ?? 0,
    });

    // Always queue level-1 directs — directReportsCount is unreliable due to permissions
    childIds.push(node.aadObjectId as string);

    // Also queue any level-2 nodes we already received
    const subDirects =
      ((node.directs as Record<string, unknown>)?.edges as Record<
        string,
        unknown
      >[]) ?? [];
    for (const subEdge of subDirects) {
      const subNode = subEdge.node as Record<string, unknown>;
      if (subNode?.aadObjectId) {
        childIds.push(subNode.aadObjectId as string);
      }
    }
  }

  return { persons, childIds };
}

export default function Scrape() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("idle");
  const [visited, setVisited] = useState(0);
  const [inserted, setInserted] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [errors, setErrors] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [queue, setQueue] = useState(0);

  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string) {
    setLog((prev) => [
      ...prev.slice(-199),
      `${new Date().toLocaleTimeString()} — ${msg}`,
    ]);
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  async function insertBatch(persons: Person[], skipExisting: boolean) {
    if (skipExisting) {
      const { data: existing } = await supabase
        .from("persons")
        .select("aad_object_id")
        .in(
          "aad_object_id",
          persons.map((p) => p.aad_object_id),
        );

      const existingIds = new Set(
        (existing ?? []).map((r: { aad_object_id: string }) => r.aad_object_id),
      );
      const toInsert = persons.filter((p) => !existingIds.has(p.aad_object_id));
      const skippedCount = persons.length - toInsert.length;

      if (toInsert.length > 0) {
        const { error } = await supabase.from("persons").insert(toInsert);
        if (error) throw error;
        setInserted((prev) => prev + toInsert.length);
      }
      setSkipped((prev) => prev + skippedCount);
      return;
    }

    const { error } = await supabase
      .from("persons")
      .upsert(persons, {
        onConflict: "aad_object_id",
        ignoreDuplicates: false,
      });
    if (error) throw error;
    setInserted((prev) => prev + persons.length);
  }

  async function startScrape() {
    const token = sessionStorage.getItem("scraper_token");
    const curlRaw = sessionStorage.getItem("scraper_curl");
    const bodyTemplateRaw = sessionStorage.getItem("scraper_body_template");
    const configRaw = sessionStorage.getItem("scraper_config");

    if (!token || !curlRaw || !bodyTemplateRaw || !configRaw) {
      toast.error("Missing session data — go back to step 1.");
      return;
    }

    const config: Config = JSON.parse(configRaw);
    const headers = parseCurlHeaders(curlRaw);
    const bodyTemplate = JSON.parse(bodyTemplateRaw);

    stopRef.current = false;
    pauseRef.current = false;
    setStatus("running");
    setVisited(0);
    setInserted(0);
    setSkipped(0);
    setErrors(0);
    setLog([]);

    const visitedSet = new Set<string>();
    const toVisit: Array<{ id: string; depth: number }> = [
      { id: config.rootId, depth: 0 },
    ];
    const buffer: Person[] = [];

    setQueue(toVisit.length);
    addLog(`Starting scrape from ${config.rootId}`);

    while (toVisit.length > 0) {
      if (stopRef.current) {
        setStatus("idle");
        addLog("Stopped.");
        return;
      }
      while (pauseRef.current) await delay(500);

      const { id, depth } = toVisit.shift()!;
      if (visitedSet.has(id)) continue;
      if (config.depthLimit > 0 && depth >= config.depthLimit) continue;
      visitedSet.add(id);

      try {
        const data = await fetchNode(id, token, headers, bodyTemplate);
        const { persons, childIds } = extractPersons(data, null);

        setVisited((prev) => prev + 1);
        addLog(
          `Fetched ${persons[0]?.full_name ?? id} — ${childIds.length} children queued`,
        );

        buffer.push(...persons);

        for (const childId of childIds) {
          if (!visitedSet.has(childId)) {
            toVisit.push({ id: childId, depth: depth + 1 });
          }
        }

        setQueue(toVisit.length);

        if (buffer.length >= config.batchSize) {
          await insertBatch(
            buffer.splice(0, config.batchSize),
            config.skipExisting,
          );
          addLog(`Inserted batch of ${config.batchSize}`);
        }

        await delay(config.requestDelay);
      } catch (e) {
        setErrors((prev) => prev + 1);
        addLog(`Error fetching ${id}: ${(e as Error).message}`);
      }
    }

    // flush remaining
    if (buffer.length > 0) {
      try {
        await insertBatch(buffer, config.skipExisting);
        addLog(`Inserted final batch of ${buffer.length}`);
      } catch (e) {
        addLog(`Error on final insert: ${(e as Error).message}`);
      }
    }

    setStatus("done");
    addLog("Scrape complete.");
    toast.success("Scrape complete!");
  }

  const isRunning = status === "running";
  const isDone = status === "done";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Scrape</h1>
            <p className="text-muted-foreground text-sm">
              Traversing the org tree and writing to Supabase.
            </p>
          </div>
          <Badge
            variant={
              status === "running"
                ? "default"
                : status === "done"
                  ? "secondary"
                  : status === "error"
                    ? "destructive"
                    : "outline"
            }
          >
            {status}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Visited", value: visited },
            { label: "Inserted", value: inserted },
            { label: "Skipped", value: skipped },
            { label: "Errors", value: errors, danger: errors > 0 },
          ].map(({ label, value, danger }) => (
            <div
              key={label}
              className="rounded-lg border bg-muted/30 p-4 text-center space-y-1"
            >
              <p
                className={`text-2xl font-semibold ${danger ? "text-destructive" : ""}`}
              >
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Queue */}
        {isRunning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Queue</span>
              <span>{queue} remaining</span>
            </div>
            <Progress
              value={
                queue === 0
                  ? 100
                  : Math.min((visited / (visited + queue)) * 100, 99)
              }
            />
          </div>
        )}

        <Separator />

        {/* Log */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Log
          </p>
          <div className="rounded-lg border bg-muted/20 p-3 h-64 overflow-y-auto font-mono text-xs space-y-1">
            {log.length === 0 && (
              <p className="text-muted-foreground">Waiting to start...</p>
            )}
            {log.map((line, i) => (
              <p
                key={i}
                className={
                  line.includes("Error")
                    ? "text-destructive"
                    : "text-foreground/80"
                }
              >
                {line}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/configure")}
            disabled={isRunning}
          >
            ← Back
          </Button>
          {!isRunning && !isDone && (
            <Button onClick={startScrape}>Start scrape</Button>
          )}
          {isRunning && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  pauseRef.current = !pauseRef.current;
                  setStatus(pauseRef.current ? "paused" : "running");
                }}
              >
                {status === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                Stop
              </Button>
            </>
          )}
          {isDone && (
            <Button variant="outline" onClick={startScrape}>
              Run again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
