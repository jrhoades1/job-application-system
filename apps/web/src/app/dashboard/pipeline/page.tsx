import { redirect } from "next/navigation";

export default function PipelineRedirect() {
  redirect("/dashboard/jobs?tab=leads");
}
