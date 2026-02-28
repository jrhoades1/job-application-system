import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Job Application Assistant
        </h1>
        <p className="text-xl text-muted-foreground">
          AI-powered job search management. Analyze postings, tailor resumes,
          track applications, and optimize your search strategy.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/sign-up">Get Started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
