import type { MeetingFull } from "@/lib/data/meetingLibrary";
import { momDateLine, momHeading } from "@/lib/core/minutes";

/** The standard MOM on screen: the same sections as the Word file, set in paper and ink. */
export function MinutesSheet({ meeting, clientCode }: { meeting: MeetingFull; clientCode: string | null }) {
  const body = meeting.minutes;
  if (!body) {
    return <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-text">{meeting.mom}</pre>;
  }
  const actions = meeting.actionItems ?? [];
  return (
    <article className="max-w-[760px]">
      <h2 className="font-display text-[22px] leading-tight text-text">{momHeading(clientCode, meeting.title)}</h2>
      <p className="mt-1 font-mono text-[12px] text-muted">{momDateLine(new Date(meeting.heldAt), meeting.location)}</p>

      <section className="mt-6">
        <h3 className="border-b border-border pb-1 font-display text-[17px] text-text">Meeting Objective</h3>
        {body.objective.trim() ? (
          <p className="mt-2 text-[14px] leading-relaxed text-text">{body.objective.trim()}</p>
        ) : (
          <p className="mt-2 text-[14px] text-muted">Not written yet.</p>
        )}
      </section>

      <section className="mt-6">
        <h3 className="border-b border-border pb-1 font-display text-[17px] text-text">Discussion Points</h3>
        {body.points.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">None recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {body.points.map((p, i) => (
              <li key={i} className="py-2.5 text-[14px] leading-relaxed text-text">
                {p.topic.trim() ? <strong className="font-semibold">{p.topic.trim()}: </strong> : null}
                {p.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h3 className="border-b border-border pb-1 font-display text-[17px] text-text">Action Points</h3>
        {actions.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">No action points.</p>
        ) : (
          <table className="ledger mt-1 w-full">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Action</th>
                <th className="w-[200px]">Owner</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a, i) => (
                <tr key={i}>
                  <td className="num text-[12px] text-muted">{i + 1}</td>
                  <td className="text-[14px]">{a.text}</td>
                  <td className="text-[13px] text-muted">{a.owner ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
