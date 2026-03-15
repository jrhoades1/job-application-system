"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { ProfileForm } from "@/components/settings/profile-form";
import { CostUsage } from "@/components/settings/cost-usage";

interface EmailConnection {
  email_address: string;
  last_fetch_at: string | null;
  is_active: boolean;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const initialTab = searchParams.get("tab") ?? "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  const [connection, setConnection] = useState<EmailConnection | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    if (gmailParam === "connected") {
      toast.success("Gmail connected successfully");
      setActiveTab("gmail");
    } else if (gmailParam === "denied") {
      toast.error("Gmail access was denied");
      setActiveTab("gmail");
    } else if (gmailParam === "error") {
      toast.error("Failed to connect Gmail — please try again");
      setActiveTab("gmail");
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setConnection(data);
        setLoadingConnection(false);
      })
      .catch(() => setLoadingConnection(false));
  }, []);

  async function handleDisconnect() {
    if (!confirm("Disconnect Gmail? You can reconnect at any time.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "DELETE" });
      if (res.ok) {
        setConnection(null);
        toast.success("Gmail disconnected");
      } else {
        toast.error("Failed to disconnect");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="gmail">Gmail</TabsTrigger>
          <TabsTrigger value="extension">Extension</TabsTrigger>
          <TabsTrigger value="costs">Cost & Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm />
        </TabsContent>

        <TabsContent value="gmail">
          <div className="max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>Email Pipeline</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Connect your Gmail account to sync job emails directly into your pipeline.
                  Only reads emails — never sends or modifies anything.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingConnection ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : connection?.is_active ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Connected
                      </Badge>
                      <span className="text-sm font-medium">
                        {connection.email_address || (
                          <span className="text-muted-foreground italic">Unknown account</span>
                        )}
                      </span>
                    </div>
                    {!connection.email_address && (
                      <p className="text-xs text-yellow-600">
                        Email address not captured. Disconnect and reconnect to fix.
                      </p>
                    )}
                    {connection.last_fetch_at && (
                      <p className="text-xs text-muted-foreground">
                        Last synced:{" "}
                        {new Date(connection.last_fetch_at).toLocaleString()}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      Disconnect
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Use the Sync Email button on the Jobs page to fetch new leads.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">Not Connected</Badge>
                    </div>
                    <Button asChild>
                      <a href="/api/gmail/connect">Connect Gmail</a>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      You&apos;ll be redirected to Google to authorize read-only access.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="extension">
          <div className="max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>Browser Extension</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Connect the Chrome extension to auto-fill job applications and track submissions.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">App URL</label>
                  <Input readOnly value={typeof window !== "undefined" ? window.location.origin : ""} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Copy this into the extension&apos;s &quot;App URL&quot; field.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">API Token</label>
                  <div className="flex gap-2">
                    <Input readOnly value={user ? `jaa_${user.id}` : "Loading..."} />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (user) {
                          navigator.clipboard.writeText(`jaa_${user.id}`);
                          toast.success("Token copied to clipboard");
                        }
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste this into the extension&apos;s &quot;API Token&quot; field.
                  </p>
                </div>
                <div className="pt-2 border-t">
                  <h4 className="text-sm font-medium mb-2">Setup Instructions</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Open Chrome and go to <code>chrome://extensions</code></li>
                    <li>Enable &quot;Developer mode&quot; (top right)</li>
                    <li>Click &quot;Load unpacked&quot; and select the <code>apps/extension/dist</code> folder</li>
                    <li>Click the extension icon and paste the App URL and API Token above</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="costs">
          <CostUsage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
