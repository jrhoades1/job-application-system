import { UserButton } from "@clerk/nextjs";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <div />
      <UserButton />
    </header>
  );
}
