import type { BeliefEvent } from "@/lib/types";

interface BeliefPerson {
  seat_id: string;
  name: string;
  alive?: boolean;
}

function suspicionBand(score: number): string {
  if (score >= 75) return "danger";
  if (score >= 55) return "wary";
  if (score >= 35) return "uncertain";
  return "trusted";
}

/** Observer rows × subject columns. A dash means the observer has not yet
 * committed a scored belief; the UI never invents a neutral score. */
export function BeliefMatrix({
  people,
  events,
  historyLimit = 8,
}: {
  people: BeliefPerson[];
  events: BeliefEvent[];
  historyLimit?: number;
}) {
  const latest = new Map<string, BeliefEvent>();
  for (const event of events) {
    latest.set(`${event.observer_seat_id}:${event.subject_seat_id}`, event);
  }
  const recent = events.slice(-historyLimit).reverse();

  return (
    <div className="belief-visualization">
      <div className="belief-matrix-wrap">
        <table className="belief-matrix">
          <thead>
            <tr>
              <th scope="col">Observer ↓</th>
              {people.map((person) => (
                <th scope="col" key={person.seat_id} title={person.name}>
                  {person.name.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((observer) => (
              <tr key={observer.seat_id}>
                <th scope="row">{observer.name}</th>
                {people.map((subject) => {
                  if (observer.seat_id === subject.seat_id) {
                    return <td key={subject.seat_id} className="belief-self" aria-label="Self">×</td>;
                  }
                  const belief = latest.get(`${observer.seat_id}:${subject.seat_id}`);
                  if (!belief) {
                    return (
                      <td key={subject.seat_id} className="belief-unknown" title="No scored belief yet">—</td>
                    );
                  }
                  return (
                    <td
                      key={subject.seat_id}
                      className={`belief-score is-${suspicionBand(belief.suspicion)}`}
                      title={`${observer.name} → ${subject.name}: ${belief.suspicion}/100 suspicion, ${belief.confidence}% confidence. ${belief.reason}`}
                    >
                      <strong>{belief.suspicion}</strong>
                      <small>{belief.confidence}%</small>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="belief-legend" aria-label="Suspicion score legend">
        <span className="is-trusted">Trusted</span>
        <span className="is-uncertain">Uncertain</span>
        <span className="is-wary">Wary</span>
        <span className="is-danger">High suspicion</span>
        <small>cell: suspicion · confidence</small>
      </div>

      {recent.length ? (
        <ol className="belief-history">
          {recent.map((belief) => (
            <li key={belief.event_key}>
              <div>
                <strong>{belief.observer_name}</strong>
                <span>→ {belief.subject_name}</span>
                <b className={`is-${suspicionBand(belief.suspicion)}`}>{belief.suspicion}/100</b>
              </div>
              <p>{belief.reason}</p>
              <small>
                v{belief.revision} · round {belief.source_round} · {belief.source_phase} · {belief.confidence}% confidence
                {belief.source_seq === null ? "" : ` · event #${belief.source_seq}`}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="metrics-empty">No agent has committed a scored belief yet.</p>
      )}
    </div>
  );
}
