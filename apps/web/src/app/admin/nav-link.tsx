"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type NavLinkProps = {
  href: string;
  children: React.ReactNode;
};

export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={clsx(
        "block rounded-2xl px-4 py-3 text-sm font-medium transition",
        isActive
          ? "bg-slate-950 text-white"
          : "bg-slate-100 text-slate-900 hover:bg-slate-200",
      )}
    >
      {children}
    </Link>
  );
}
