import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  { title: "Paste Any Job URL", desc: "Chrome extension captures the full job description from LinkedIn, Indeed, or any job board." },
  { title: "Instant Fit Score", desc: "See if the job is worth your time in seconds. Algorithmic scoring matches your experience to requirements." },
  { title: "Tailored Resume", desc: "AI rewrites your resume to highlight the skills that matter for each specific role." },
  { title: "Cover Letter", desc: "A custom cover letter that addresses the job requirements and frames your gaps strategically." },
  { title: "Application Tracker", desc: "Track every application from lead to offer. See where you stand at a glance." },
  { title: "Email Pipeline", desc: "Forward job alerts from any source. They auto-score and appear in your lead queue." },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    highlight: false,
    features: [
      "Unlimited job scoring",
      "Chrome extension capture",
      "3 AI applications / month",
      "Application tracker",
    ],
    cta: "Get Started Free",
    href: "/sign-up",
  },
  {
    name: "Pro",
    price: "$25",
    period: "/ month",
    highlight: true,
    features: [
      "Everything in Free",
      "30 AI applications / month",
      "Resume tailoring",
      "Cover letter generation",
      "Gmail lead pipeline",
      "Analytics dashboard",
    ],
    cta: "Start Pro",
    href: "/sign-up",
  },
  {
    name: "Career Maintenance",
    price: "$10",
    period: "/ month",
    highlight: false,
    features: [
      "5 AI applications / month",
      "Quarterly resume refresh",
      "Stay market-aware",
      "Reactivate to Pro anytime",
    ],
    cta: "Available After Hire",
    href: "#",
    disabled: true,
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="max-w-3xl space-y-6">
          <h1 className="text-5xl font-bold tracking-tight">
            Paste a job URL. Get a tailored application in 2 minutes.
          </h1>
          <p className="text-xl text-muted-foreground">
            AI-powered job search management. Score your fit, tailor your resume,
            generate cover letters, and track everything in one place.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/sign-up">Get Started Free</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 py-16" id="pricing">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-4">Simple Pricing</h2>
          <p className="text-center text-muted-foreground mb-12">
            Need more? Top off with 10 extra applications for $5 anytime.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {tiers.map((tier) => (
              <Card
                key={tier.name}
                className={tier.highlight ? "border-2 border-primary shadow-lg" : ""}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{tier.name}</CardTitle>
                    {tier.highlight && <Badge>Most Popular</Badge>}
                  </div>
                  <div className="mt-2">
                    <span className="text-4xl font-bold">{tier.price}</span>
                    <span className="text-muted-foreground ml-1">{tier.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 mt-0.5">&#10003;</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild={!tier.disabled}
                    className="w-full"
                    variant={tier.highlight ? "default" : "outline"}
                    disabled={tier.disabled}
                  >
                    {tier.disabled ? (
                      <span>{tier.cta}</span>
                    ) : (
                      <Link href={tier.href}>{tier.cta}</Link>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
        Job Application Assistant
      </footer>
    </div>
  );
}
