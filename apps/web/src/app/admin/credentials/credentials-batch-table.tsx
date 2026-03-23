"use client";

import { useMemo, useState } from "react";

type CredentialRow = {
  id: string;
  loginCode: string;
  password: string | null;
  fullName: string;
  email: string;
  regionName: string | null;
  roleLabel: string;
};

type CredentialsBatchTableProps = {
  rows: CredentialRow[];
};

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export function CredentialsBatchTable({ rows }: CredentialsBatchTableProps) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasRows = useMemo(() => rows.length > 0, [rows.length]);

  async function copyValue(id: string, value: string | null) {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 1400);
  }

  function formatCombinedCredentials(row: CredentialRow) {
    if (!row.password) {
      return null;
    }

    return `Логин: ${row.loginCode}, Пароль: ${row.password}`;
  }

  if (!hasRows) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
        В выбранном batch пока нет записей.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 font-medium text-slate-600">Пользователь</th>
            <th className="px-4 py-3 font-medium text-slate-600">Логин</th>
            <th className="px-4 py-3 font-medium text-slate-600">Пароль</th>
            <th className="px-4 py-3 font-medium text-slate-600">Регион</th>
            <th className="px-4 py-3 font-medium text-slate-600">Роль</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row) => {
            const isRevealed = Boolean(revealedIds[row.id]);
            const visiblePassword = isRevealed ? row.password ?? "Недоступно" : "••••••••••••••••";

            return (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-4">
                  <p className="font-medium text-slate-950">{row.fullName}</p>
                  <p className="mt-1 text-slate-500">{row.email}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <code className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
                      {row.loginCode}
                    </code>
                    <IconButton
                      title="Скопировать логин и пароль"
                      onClick={() =>
                        copyValue(`login-${row.id}`, formatCombinedCredentials(row))
                      }
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M7 2.75A2.25 2.25 0 0 0 4.75 5v8A2.25 2.25 0 0 0 7 15.25h6A2.25 2.25 0 0 0 15.25 13V5A2.25 2.25 0 0 0 13 2.75H7ZM6.25 5c0-.414.336-.75.75-.75h6c.414 0 .75.336.75.75v8a.75.75 0 0 1-.75.75H7a.75.75 0 0 1-.75-.75V5Z" />
                        <path d="M3.75 7.5a.75.75 0 0 1 1.5 0v8c0 .414.336.75.75.75h6a.75.75 0 0 1 0 1.5H6a2.25 2.25 0 0 1-2.25-2.25v-8Z" />
                      </svg>
                    </IconButton>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <code className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
                      {visiblePassword}
                    </code>
                    <IconButton
                      title={isRevealed ? "Скрыть пароль" : "Показать пароль"}
                      onClick={() =>
                        setRevealedIds((current) => ({
                          ...current,
                          [row.id]: !current[row.id],
                        }))
                      }
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M10 4.25c-4.118 0-7.292 2.662-8.635 5.11a1.5 1.5 0 0 0 0 1.28C2.708 13.088 5.882 15.75 10 15.75s7.292-2.662 8.635-5.11a1.5 1.5 0 0 0 0-1.28C17.292 6.912 14.118 4.25 10 4.25Zm0 10c-3.452 0-6.17-2.206-7.336-4.35C3.83 7.956 6.548 5.75 10 5.75s6.17 2.206 7.336 4.15c-1.166 2.144-3.884 4.35-7.336 4.35Z" />
                        <path d="M10 7.25A2.75 2.75 0 1 0 10 12.75 2.75 2.75 0 0 0 10 7.25Zm0 4A1.25 1.25 0 1 1 10 8.75a1.25 1.25 0 0 1 0 2.5Z" />
                      </svg>
                    </IconButton>
                    <IconButton
                      title="Скопировать логин и пароль"
                      onClick={() =>
                        copyValue(`credentials-${row.id}`, formatCombinedCredentials(row))
                      }
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M7 2.75A2.25 2.25 0 0 0 4.75 5v8A2.25 2.25 0 0 0 7 15.25h6A2.25 2.25 0 0 0 15.25 13V5A2.25 2.25 0 0 0 13 2.75H7ZM6.25 5c0-.414.336-.75.75-.75h6c.414 0 .75.336.75.75v8a.75.75 0 0 1-.75.75H7a.75.75 0 0 1-.75-.75V5Z" />
                        <path d="M3.75 7.5a.75.75 0 0 1 1.5 0v8c0 .414.336.75.75.75h6a.75.75 0 0 1 0 1.5H6a2.25 2.25 0 0 1-2.25-2.25v-8Z" />
                      </svg>
                    </IconButton>
                    {copiedId === `credentials-${row.id}` || copiedId === `login-${row.id}` ? (
                      <span className="text-xs font-medium text-emerald-600">Скопировано</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-600">{row.regionName ?? "Не указан"}</td>
                <td className="px-4 py-4 text-slate-600">{row.roleLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
