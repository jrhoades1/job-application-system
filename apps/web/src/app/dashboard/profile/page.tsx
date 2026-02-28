"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ProfileRow } from "@/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          linkedin_url: profile.linkedin_url,
          narrative: profile.narrative,
        }),
      });
      if (res.ok) {
        toast.success("Profile saved");
      } else {
        toast.error("Failed to save profile");
      }
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading profile...</div>;
  }

  if (!profile) {
    return (
      <div className="text-muted-foreground">
        Profile not found. Please sign out and sign back in.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold">Profile Setup</h2>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={profile.full_name}
                onChange={(e) =>
                  setProfile({ ...profile, full_name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={profile.email}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={profile.phone ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Location</label>
              <Input
                value={profile.location ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, location: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">LinkedIn URL</label>
              <Input
                value={profile.linkedin_url ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, linkedin_url: e.target.value })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Career Narrative</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Describe your career positioning — who you are, what you bring, and what kind of roles you're targeting..."
            rows={6}
            value={profile.narrative ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, narrative: e.target.value })
            }
          />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Profile"}
      </Button>
    </div>
  );
}
