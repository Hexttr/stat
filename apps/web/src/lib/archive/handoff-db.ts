import { Pool } from "pg";

type HandoffValueRow = {
  source_doc: string;
  form: string;
  year: number;
  xml_tag: string;
  value_raw: string | null;
  table_code: string | null;
  table_title: string | null;
  row_no: string | null;
  row_label: string | null;
  col_no: string | null;
  col_label: string | null;
};

const globalForHandoffPool = globalThis as typeof globalThis & {
  handoffPool?: Pool;
};

function getConnectionString() {
  return process.env.HANDOFF_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

export function getHandoffPool() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    throw new Error(
      "Не настроено подключение к handoff PostgreSQL. Укажите HANDOFF_DATABASE_URL или DATABASE_URL.",
    );
  }

  if (!globalForHandoffPool.handoffPool) {
    globalForHandoffPool.handoffPool = new Pool({
      connectionString,
      max: 4,
    });
  }

  return globalForHandoffPool.handoffPool;
}

export async function assertHandoffSchemaAvailable() {
  const pool = getHandoffPool();
  const result = await pool.query<{ stg_values: string | null }>(
    "select to_regclass('statforms.stg_values') as stg_values",
  );

  if (!result.rows[0]?.stg_values) {
    throw new Error(
      "В подключенной БД не найдена схема statforms.stg_values. Сначала восстановите handoff dump в PostgreSQL и укажите HANDOFF_DATABASE_URL.",
    );
  }
}

export async function fetchHandoffValuesBySourceDocs(sourceDocs: string[]) {
  if (sourceDocs.length === 0) {
    return [] as HandoffValueRow[];
  }

  await assertHandoffSchemaAvailable();
  const pool = getHandoffPool();
  const result = await pool.query<HandoffValueRow>(
    `
      select
        sv.source_doc,
        sv.form,
        sv.year,
        sv.xml_tag,
        sv.value_raw,
        sp.table_code,
        sp.table_title,
        sp.row_no,
        sp.row_label,
        sp.col_no,
        sp.col_label
      from statforms.stg_values sv
      left join statforms.semantic_passports_final_v2 sp
        on sp.form = sv.form
       and sp.year = sv.year
       and sp.xml_tag = sv.xml_tag
      where sv.source_doc = any($1::text[])
      order by sv.source_doc, sv.form, sv.year, sv.xml_tag
    `,
    [sourceDocs],
  );

  return result.rows;
}
