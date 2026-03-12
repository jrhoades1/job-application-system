import { redirect } from "next/navigation";

export default function TrackerRedirect() {
  redirect("/dashboard/jobs?tab=evaluating");
}
