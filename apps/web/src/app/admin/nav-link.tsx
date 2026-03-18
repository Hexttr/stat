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
        "block rounded-2xl px-4 py-3 text-[15px] font-medium transition",
        isActive
          ? "bg-[#1f67ab] text-white shadow-[0_10px_20px_rgba(31,103,171,0.18)]"
          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
      )}
    >
      {children}
    </Link>
  );
}
