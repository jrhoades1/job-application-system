"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ProfileRow, AchievementCategory } from "@/types";

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

  function updateAchievements(achievements: AchievementCategory[]) {
    if (!profile) return;
    setProfile({ ...profile, achievements });
  }

  function addCategory() {
    const name = prompt("Category name (e.g. Leadership, Technical Skills, AI/ML):");
    if (!name?.trim()) return;
    updateAchievements([
      ...(profile?.achievements ?? []),
      { category: name.trim(), items: [] },
    ]);
  }

  function removeCategory(index: number) {
    const achievements = [...(profile?.achievements ?? [])];
    achievements.splice(index, 1);
    updateAchievements(achievements);
  }

  function addItem(catIndex: number) {
    const achievements = [...(profile?.achievements ?? [])];
    achievements[catIndex] = {
      ...achievements[catIndex],
      items: [...achievements[catIndex].items, { text: "" }],
    };
    updateAchievements(achievements);
  }

  function updateItem(catIndex: number, itemIndex: number, text: string) {
    const achievements = [...(profile?.achievements ?? [])];
    const items = [...achievements[catIndex].items];
    items[itemIndex] = { ...items[itemIndex], text };
    achievements[catIndex] = { ...achievements[catIndex], items };
    updateAchievements(achievements);
  }

  function removeItem(catIndex: number, itemIndex: number) {
    const achievements = [...(profile?.achievements ?? [])];
    const items = [...achievements[catIndex].items];
    items.splice(itemIndex, 1);
    achievements[catIndex] = { ...achievements[catIndex], items };
    updateAchievements(achievements);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      // Filter out empty achievement items before saving
      const cleanedAchievements = (profile.achievements ?? [])
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((item) => item.text.trim() !== ""),
        }))
        .filter((cat) => cat.items.length > 0);

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
          achievements: cleanedAchievements,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
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

  const achievements = profile.achievements ?? [];

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Skills & Achievements</CardTitle>
            <Button variant="outline" size="sm" onClick={addCategory}>
              + Add Category
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Add your skills, experience, and achievements. These are matched
            against job requirements when scoring applications.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {achievements.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No achievements yet. Click &quot;Add Category&quot; to get started
              (e.g. Technical Skills, Leadership, Education).
            </p>
          )}
          {achievements.map((cat, catIndex) => (
            <div key={catIndex} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{cat.category}</h4>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(catIndex)}
                  >
                    + Item
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeCategory(catIndex)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {cat.items.map((item, itemIndex) => (
                <div key={itemIndex} className="flex gap-2">
                  <Input
                    value={item.text}
                    placeholder="e.g. 5+ years Python, Led team of 15 engineers, AWS certified..."
                    onChange={(e) =>
                      updateItem(catIndex, itemIndex, e.target.value)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeItem(catIndex, itemIndex)}
                  >
                    X
                  </Button>
                </div>
              ))}
              {cat.items.length === 0 && (
                <p className="text-xs text-muted-foreground pl-1">
                  Click &quot;+ Item&quot; to add achievements to this category.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Profile"}
      </Button>
    </div>
  );
}
