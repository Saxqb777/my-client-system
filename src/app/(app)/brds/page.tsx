import type { Metadata } from "next";
import Link from "next/link";
import { brdOverview } from "@/lib/data/brd";
import { formatDate } from "@/lib/core/dates";
import { PageHeader } from "@/components/aurora/PageHeader";

export const metadata: Metadata = { title: "BRDs" };

/** Where each client's BRD stands: items read from meetings, the latest draft, the last gap check. */
export default async function BrdsPage() {
  const rows = await brdOverview();
  const items = rows.reduce((n, r) => n + r.items, 0);
  return (
    <div className="animate-fade-up">
      <PageHeader title="BRDs" description={`${items} ${items === 1 ? "requirement item" : "requirement items"} across ${rows.length} ${rows.length === 1 ? "client" : "clients"}. Open a client to read meetings, write the draft or check a BRD.`} />
      <table className="ledger w-full">
        <thead>
          <tr>
            <th>Client</th>
            <th className="w-[120px]">Items</th>
            <th className="hidden w-[150px] sm:table-cell">Meetings read</th>
            <th className="w-[150px]">Draft</th>
            <th className="hidden w-[170px] md:table-cell">Last gap check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clientId}>
              <td>
                <Link href={`/clients/${r.clientId}?tab=brd`} className="serif text-[18px] leading-tight text-text hover:underline">
                  {r.name}
                </Link>
                <p className="num mt-0.5 text-[12px] text-muted">{r.code}</p>
              </td>
              <td className="text-[13px]">
                {r.items ? (
                  <>
                    <span className="num">{r.items}</span>
                    <span className="text-muted">{r.covered ? `, ${r.covered} covered` : ""}</span>
                  </>
                ) : (
                  <span className="text-muted">None yet</span>
                )}
              </td>
              <td className="hidden text-[13px] sm:table-cell">
                <span className="num">{r.read}</span>
                <span className="text-muted"> of {r.readable}</span>
              </td>
              <td className="text-[13px]">
                {r.draft ? (
                  <>
                    <a href={`/api/brd/${r.draft.id}/docx`} className="link" download>
                      v{r.draft.version}
                    </a>
                    <span className="num text-[12px] text-muted"> {formatDate(r.draft.createdAt, false)}</span>
                  </>
                ) : (
                  <span className="text-muted">Not written</span>
                )}
              </td>
              <td className="hidden text-[13px] md:table-cell">
                {r.gap ? (
                  <>
                    <span className="num text-[12px]">{formatDate(r.gap.createdAt, false)}</span>
                    <span className="text-muted">, {r.gap.findings} {r.gap.findings === 1 ? "finding" : "findings"}</span>
                  </>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
