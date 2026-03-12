"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ProfileRow, AchievementCategory, WorkHistoryEntry } from "@/types";

interface ParsedResume {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  narrative?: string | null;
  work_history?: WorkHistoryEntry[];
  achievements?: AchievementCategory[];
}

export function ProfileForm() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedResume | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function addWorkEntry() {
    if (!profile) return;
    setProfile({
      ...profile,
      work_history: [
        ...(profile.work_history ?? []),
        { company: "", title: "", start_date: "", end_date: null, current: false },
      ],
    });
  }

  function updateWorkEntry(index: number, field: string, value: string | boolean | null) {
    if (!profile) return;
    const history = [...(profile.work_history ?? [])];
    history[index] = { ...history[index], [field]: value };
    setProfile({ ...profile, work_history: history });
  }

  function removeWorkEntry(index: number) {
    if (!profile) return;
    const history = [...(profile.work_history ?? [])];
    history.splice(index, 1);
    setProfile({ ...profile, work_history: history });
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      const cleanedAchievements = (profile.achievements ?? [])
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((item) => item.text.trim() !== ""),
        }))
        .filter((cat) => cat.items.length > 0);

      const cleanedWorkHistory = (profile.work_history ?? []).filter(
        (w) => w.company.trim() !== "" || w.title.trim() !== ""
      );

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
          work_history: cleanedWorkHistory,
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

  async function handleParseResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: form });
      if (res.ok) {
        const data: ParsedResume = await res.json();
        setParsedPreview(data);
        toast.success("Resume parsed — review and apply below");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to parse resume");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function applyParsedResume() {
    if (!profile || !parsedPreview) return;
    setProfile({
      ...profile,
      full_name: parsedPreview.full_name || profile.full_name,
      email: parsedPreview.email || profile.email,
      phone: parsedPreview.phone || profile.phone || null,
      location: parsedPreview.location || profile.location || null,
      linkedin_url: parsedPreview.linkedin_url || profile.linkedin_url || null,
      narrative: parsedPreview.narrative || profile.narrative || null,
      work_history: parsedPreview.work_history && parsedPreview.work_history.length > 0
        ? parsedPreview.work_history
        : profile.work_history ?? [],
      achievements: mergeParsedAchievements(
        profile.achievements ?? [],
        parsedPreview.achievements ?? []
      ),
    });
    setParsedPreview(null);
    toast.success("Profile pre-filled — review and save");
  }

  function mergeParsedAchievements(
    existing: AchievementCategory[],
    parsed: AchievementCategory[]
  ): AchievementCategory[] {
    const result = [...existing];
    for (const parsedCat of parsed) {
      const existingCat = result.find(
        (c) => c.category.toLowerCase() === parsedCat.category.toLowerCase()
      );
      if (existingCat) {
        const existingTexts = new Set(existingCat.items.map((i) => i.text.toLowerCase()));
        const newItems = parsedCat.items.filter(
          (i) => !existingTexts.has(i.text.toLowerCase())
        );
        existingCat.items = [...existingCat.items, ...newItems];
      } else {
        result.push(parsedCat);
      }
    }
    return result;
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
      {/* Resume Upload Card */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Import from Resume</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload your resume and Claude will pre-fill your profile. PDF, DOCX, or TXT — max 500 KB.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={handleParseResume}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
            >
              {parsing ? "Parsing..." : "Upload Resume"}
            </Button>
            {parsing && (
              <span className="text-sm text-muted-foreground">Claude is reading your resume...</span>
            )}
          </div>

          {parsedPreview && (
            <div className="rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-200">
                    Resume Preview
                  </span>
                  <p className="text-sm text-muted-foreground">Click &quot;Apply&quot; to fill in the form below</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyParsedResume}>Apply to Profile</Button>
                  <Button size="sm" variant="ghost" onClick={() => setParsedPreview(null)}>Dismiss</Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground grid gap-x-6 gap-y-1 grid-cols-1 sm:grid-cols-2">
                {parsedPreview.full_name && (
                  <p className="truncate"><span className="font-medium text-foreground">Name:</span> {parsedPreview.full_name}</p>
                )}
                {parsedPreview.email && (
                  <p className="truncate"><span className="font-medium text-foreground">Email:</span> {parsedPreview.email}</p>
                )}
                {parsedPreview.phone && (
                  <p className="truncate"><span className="font-medium text-foreground">Phone:</span> {parsedPreview.phone}</p>
                )}
                {parsedPreview.location && (
                  <p className="truncate"><span className="font-medium text-foreground">Location:</span> {parsedPreview.location}</p>
                )}
                {parsedPreview.linkedin_url && (
                  <p className="truncate sm:col-span-2"><span className="font-medium text-foreground">LinkedIn:</span> {parsedPreview.linkedin_url}</p>
                )}
              </div>
              {parsedPreview.narrative && (
                <p className="text-sm text-muted-foreground border-t border-blue-200 dark:border-blue-800 pt-2">
                  <span className="font-medium text-foreground">Narrative:</span> {parsedPreview.narrative.slice(0, 200)}{parsedPreview.narrative.length > 200 ? "..." : ""}
                </p>
              )}
              {parsedPreview.work_history && parsedPreview.work_history.length > 0 && (
                <p className="text-sm text-muted-foreground border-t border-blue-200 dark:border-blue-800 pt-2">
                  <span className="font-medium text-foreground">Work History:</span> {parsedPreview.work_history.map(w => `${w.title} at ${w.company}`).join(", ")}
                </p>
              )}
              {parsedPreview.achievements && parsedPreview.achievements.length > 0 && (
                <p className="text-sm text-muted-foreground border-t border-blue-200 dark:border-blue-800 pt-2">
                  <span className="font-medium text-foreground">Achievements:</span> {parsedPreview.achievements.map(c => `${c.category} (${c.items.length})`).join(", ")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
            <CardTitle>Work History</CardTitle>
            <Button variant="outline" size="sm" onClick={addWorkEntry}>
              + Add Position
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Your actual job titles and companies. These are used in tailored resumes to prevent fabrication.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(profile.work_history ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No work history yet. Upload your resume above to auto-populate, or click &quot;+ Add Position&quot;.
            </p>
          )}
          {(profile.work_history ?? []).map((entry, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {entry.title && entry.company
                    ? `${entry.title} — ${entry.company}`
                    : `Position ${i + 1}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeWorkEntry(i)}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium">Job Title</label>
                  <Input
                    placeholder="e.g. Director of Engineering"
                    value={entry.title}
                    onChange={(e) => updateWorkEntry(i, "title", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Company</label>
                  <Input
                    placeholder="e.g. Acme Corp"
                    value={entry.company}
                    onChange={(e) => updateWorkEntry(i, "company", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Start Date</label>
                  <Input
                    placeholder="YYYY-MM"
                    value={entry.start_date}
                    onChange={(e) => updateWorkEntry(i, "start_date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">End Date</label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="YYYY-MM"
                      value={entry.end_date ?? ""}
                      disabled={entry.current}
                      onChange={(e) => updateWorkEntry(i, "end_date", e.target.value || null)}
                    />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={entry.current ?? false}
                        onChange={(e) => {
                          updateWorkEntry(i, "current", e.target.checked);
                          if (e.target.checked) updateWorkEntry(i, "end_date", null);
                        }}
                      />
                      Current
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
