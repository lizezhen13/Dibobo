import type { ReactNode } from "react";

export interface RecordField {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

/** A narrow-screen record keeps primary values visible and secondary fields accessible. */
export function RecordCard({
  title,
  selection,
  fields,
  details = [],
  actions,
}: {
  title: ReactNode;
  selection?: ReactNode;
  fields: RecordField[];
  details?: RecordField[];
  actions?: ReactNode;
}) {
  return (
    <article className="record-card min-w-0 border-b border-border p-4 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        {selection}
        <div className="min-w-0 flex-1">{title}</div>
      </div>
      <RecordFields fields={fields} />
      {details.length > 0 && (
        <details className="mt-3 rounded-lg bg-secondary/40 px-3 open:pb-3">
          <summary className="cursor-pointer py-3 text-label font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
            更多指标与备注
          </summary>
          <RecordFields fields={details} />
        </details>
      )}
      {actions && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </article>
  );
}

function RecordFields({ fields }: { fields: RecordField[] }) {
  return (
    <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
      {fields.map((field) => (
        <div key={field.id} className="min-w-0">
          <dt className="text-label text-muted-foreground">{field.label}</dt>
          <dd className="mt-1 break-words text-table font-medium text-foreground [overflow-wrap:anywhere] [&_.truncate]:whitespace-normal [&_.truncate]:overflow-visible [&_.truncate]:text-clip">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
