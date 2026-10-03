// TuringDB answers every query with the same JSON envelope (HTTP server and
// the on-device engine alike): the result arrives column by column, in chunks.
//   {"header":{"column_names":[..],"column_types":[..]},"data":[[col, col, ..], ..],"time":ms}
//   {"error":"<STATUS>","error_details":"..."}

export type Value = string | number | boolean | null | Value[];
export type Row = Record<string, Value>;

type Envelope = {
  header?: { column_names: string[]; column_types: string[] };
  data?: Value[][][];
  error?: string;
  error_details?: string;
};

export class QueryError extends Error {
  readonly status: string;

  constructor(status: string, details: string) {
    super(`${status}: ${details}`);
    this.name = 'QueryError';
    this.status = status;
  }
}

export function parseEnvelope(json: string): Row[] {
  const envelope = JSON.parse(json) as Envelope;
  if (envelope.error) {
    throw new QueryError(envelope.error, envelope.error_details ?? '');
  }

  const names = envelope.header?.column_names ?? [];
  const rows: Row[] = [];
  for (const chunk of envelope.data ?? []) {
    const rowCount = chunk[0]?.length ?? 0;
    for (let r = 0; r < rowCount; r++) {
      const row: Row = {};
      names.forEach((name, c) => {
        row[name] = chunk[c][r];
      });
      rows.push(row);
    }
  }
  return rows;
}
