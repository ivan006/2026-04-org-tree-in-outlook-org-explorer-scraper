import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function parseCurl(
  raw: string,
): {
  token: string;
  rootId: string;
  headers: Record<string, string>;
  body: object;
} | null {
  try {
    const urlMatch = raw.match(/curl '([^']+)'/);
    if (!urlMatch) return null;

    const headers: Record<string, string> = {};
    const headerMatches = raw.matchAll(/-H '([^:]+): ([^']+)'/g);
    for (const m of headerMatches) {
      headers[m[1].toLowerCase()] = m[2];
    }

    const bodyMatch = raw.match(/--data-raw '(.+)'$/s);
    if (!bodyMatch) return null;
    const body = JSON.parse(bodyMatch[1]);

    const token = body?.__request_headers?.authorization?.replace(
      "Bearer ",
      "",
    );
    if (!token) return null;

    const rootId = body?.variables?.personIds?.aadObjectId;
    if (!rootId) return null;

    return { token, rootId, headers, body };
  } catch {
    return null;
  }
}

export default function Index() {
  const navigate = useNavigate();
  const [curl, setCurl] = useState("");
  const [parsed, setParsed] = useState<{
    token: string;
    rootId: string;
  } | null>(null);

  function handleValidate() {
    const result = parseCurl(curl);
    if (!result) {
      toast.error(
        "Could not parse curl. Make sure you copied the full request from the network tab.",
      );
      setParsed(null);
      return;
    }

    // Check token expiry from JWT payload
    try {
      const payload = JSON.parse(atob(result.token.split(".")[1]));
      const exp = payload.exp * 1000;
      if (Date.now() > exp) {
        toast.error(
          "Bearer token is expired. Please get a fresh curl from the network tab.",
        );
        setParsed(null);
        return;
      }
      const expiresIn = Math.round((exp - Date.now()) / 1000 / 60);
      toast.success(`Token valid — expires in ${expiresIn} minutes`);
    } catch {
      toast.warning("Could not check token expiry, proceeding anyway.");
    }

    setParsed({ token: result.token, rootId: result.rootId });
    sessionStorage.setItem("scraper_curl", curl);
    sessionStorage.setItem("scraper_token", result.token);
    sessionStorage.setItem("scraper_root_id", result.rootId);
    sessionStorage.setItem("scraper_headers", JSON.stringify(result.headers));
    sessionStorage.setItem(
      "scraper_body_template",
      JSON.stringify(result.body),
    );
  }

  function handleContinue() {
    navigate("/configure");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Org Explorer Scraper
          </h1>
          <p className="text-muted-foreground text-sm">
            Scrapes your organisation's directory from Outlook Org Explorer and
            stores it in Supabase.
          </p>
        </div>

        {/* Instructions */}
        <div className="rounded-lg border bg-muted/40 p-5 space-y-4 text-sm">
          <p className="font-medium">How to get your curl request</p>
          <ol className="space-y-3 text-muted-foreground list-none">
            <li className="flex gap-3">
              <Badge
                variant="outline"
                className="shrink-0 h-5 w-5 flex items-center justify-center text-xs"
              >
                1
              </Badge>
              <span>
                Open{" "}
                <strong className="text-foreground">Outlook on the web</strong>{" "}
                and navigate to{" "}
                <strong className="text-foreground">Org Explorer</strong> from
                the left sidebar.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge
                variant="outline"
                className="shrink-0 h-5 w-5 flex items-center justify-center text-xs"
              >
                2
              </Badge>
              <span>
                Open browser DevTools (
                <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">
                  F12
                </kbd>
                ) and go to the{" "}
                <strong className="text-foreground">Network</strong> tab.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge
                variant="outline"
                className="shrink-0 h-5 w-5 flex items-center justify-center text-xs"
              >
                3
              </Badge>
              <span>
                Filter requests by{" "}
                <strong className="text-foreground">graphql</strong>. Click on
                any person in Org Explorer to trigger a request.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge
                variant="outline"
                className="shrink-0 h-5 w-5 flex items-center justify-center text-xs"
              >
                4
              </Badge>
              <span>
                Find a request named{" "}
                <strong className="text-foreground">
                  useOrgExplorerQueryRef_OrganizationQuery
                </strong>
                , right-click it →{" "}
                <strong className="text-foreground">
                  Copy → Copy as cURL (bash)
                </strong>
                .
              </span>
            </li>
            <li className="flex gap-3">
              <Badge
                variant="outline"
                className="shrink-0 h-5 w-5 flex items-center justify-center text-xs"
              >
                5
              </Badge>
              <span>
                Paste it below. Tokens expire after ~90 minutes — if scraping
                fails, come back and paste a fresh one.
              </span>
            </li>
          </ol>
        </div>

        {/* Curl input */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Paste curl request</label>
          <Textarea
            value={curl}
            onChange={(e) => {
              setCurl(e.target.value);
              setParsed(null);
            }}
            placeholder="curl 'https://zaf.loki.delve.office.com/...' ..."
            className="font-mono text-xs min-h-[140px] resize-y"
          />
        </div>

        {/* Parsed result */}
        {parsed && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2 text-sm">
            <p className="font-medium text-green-600 dark:text-green-400">
              Token extracted successfully
            </p>
            <div className="space-y-1 text-muted-foreground font-mono text-xs">
              <p>
                <span className="text-foreground">Root ID:</span>{" "}
                {parsed.rootId}
              </p>
              <p>
                <span className="text-foreground">Token:</span>{" "}
                {parsed.token.slice(0, 40)}…
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleValidate}
            variant="outline"
            disabled={!curl.trim()}
          >
            Validate
          </Button>
          <Button onClick={handleContinue} disabled={!parsed}>
            Continue to configure →
          </Button>
        </div>
      </div>
    </div>
  );
}
