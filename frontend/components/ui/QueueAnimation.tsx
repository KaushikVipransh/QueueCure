'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocketContext } from '@/contexts/SocketContext';

// ─── Person SVG figure ────────────────────────────────────────────────────────
// A minimal seated silhouette.  Colour shifts depending on role.

type PersonState = 'idle' | 'enter' | 'exit' | 'called';

interface Person {
  id: number;
  state: PersonState;
  /** 0 = front of queue (next to be called) */
  position: number;
  hue: number; // slight colour variation per person
}

const MAX_VISIBLE = 7; // how many seats we show

function PersonFigure({
  person,
  isFirst,
}: {
  person: Person;
  isFirst: boolean;
}) {
  const animClass =
    person.state === 'enter'  ? 'queue-person-enter'  :
    person.state === 'exit'   ? 'queue-person-exit'   :
    person.state === 'called' ? 'queue-person-called' :
    'queue-person-idle';

  // colour: front person is brighter sky, rest are muted
  const bodyColor = isFirst ? '#B3CFE5' : 'rgba(179,207,229,0.45)';
  const headColor = isFirst ? '#daeaf6' : 'rgba(179,207,229,0.55)';

  return (
    <span
      className={animClass}
      style={{
        display: 'inline-block',
        animationDelay: person.state === 'idle' ? `${person.id * 0.31}s` : '0s',
      }}
    >
      {/* Seated stick figure — SVG */}
      <svg
        width="18"
        height="22"
        viewBox="0 0 18 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* head */}
        <circle cx="9" cy="4" r="3" fill={headColor} />
        {/* torso */}
        <path d="M9 7 L9 14" stroke={bodyColor} strokeWidth="2" strokeLinecap="round" />
        {/* arms */}
        <path d="M9 9 L5 12 M9 9 L13 12" stroke={bodyColor} strokeWidth="1.5" strokeLinecap="round" />
        {/* legs — seated: bent at knee */}
        <path d="M9 14 L6 18 L3 18" stroke={bodyColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 14 L12 18 L15 18" stroke={bodyColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* seat line */}
        <line x1="2" y1="18" x2="16" y2="18" stroke={bodyColor} strokeWidth="1" strokeOpacity="0.4" />
      </svg>
    </span>
  );
}

// ─── QueueAnimation ───────────────────────────────────────────────────────────

let _nextId = 1;

export function QueueAnimation() {
  const { queueState } = useSocketContext();
  const [people, setPeople] = useState<Person[]>([]);
  const prevWaitingCount = useRef<number | null>(null);

  // Seed initial people from live queue state, then animate deltas
  useEffect(() => {
    if (!queueState) return;

    const waiting = queueState.waitingPatients.length;
    const prev    = prevWaitingCount.current;

    if (prev === null) {
      // First load — populate seats instantly (no animation)
      const count = Math.min(waiting, MAX_VISIBLE);
      setPeople(
        Array.from({ length: count }, (_, i) => ({
          id:       _nextId++,
          state:    'idle' as PersonState,
          position: i,
          hue:      i,
        })),
      );
      prevWaitingCount.current = waiting;
      return;
    }

    if (waiting > prev) {
      // New patient added → new person enters from the right
      setPeople((old) => {
        const visible = Math.min(old.length + 1, MAX_VISIBLE);
        const incoming: Person = {
          id:       _nextId++,
          state:    'enter',
          position: visible - 1,
          hue:      visible - 1,
        };
        const base = old.slice(0, MAX_VISIBLE - 1).map((p, i) => ({ ...p, position: i, state: 'idle' as PersonState }));
        return [...base, incoming];
      });

      // After enter animation settles, switch to idle
      setTimeout(() => {
        setPeople((old) => old.map((p) => ({ ...p, state: 'idle' })));
      }, 600);
    } else if (waiting < prev) {
      // Patient called / removed → front person exits, rest shift left
      setPeople((old) => {
        if (old.length === 0) return old;
        const [first, ...rest] = old;
        // Mark first as "called" briefly then exit
        return [{ ...first, state: 'called' }, ...rest.map((p) => ({ ...p, state: 'idle' as PersonState }))];
      });

      // Play exit animation
      setTimeout(() => {
        setPeople((old) => {
          if (old.length === 0) return old;
          const [first, ...rest] = old;
          return [{ ...first, state: 'exit' }, ...rest];
        });
      }, 400);

      // Remove exited person, shift everyone left
      setTimeout(() => {
        setPeople((old) => {
          const next = old.slice(1).map((p, i) => ({ ...p, position: i, state: 'idle' as PersonState }));
          return next;
        });
      }, 850);
    }

    prevWaitingCount.current = waiting;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueState?.waitingPatients.length]);

  const count = queueState?.waitingPatients.length ?? 0;

  return (
    <div
      className="flex items-end gap-[3px] select-none"
      title={`${count} patient${count !== 1 ? 's' : ''} waiting`}
      aria-label={`${count} patients in queue`}
    >
      {/* Empty seats (chairs drawn even if nobody sitting) */}
      {Array.from({ length: Math.min(Math.max(people.length, 1), MAX_VISIBLE) }).map((_, i) => {
        const person = people[i];
        return (
          <div key={i} className="relative flex flex-col items-center">
            {person ? (
              <PersonFigure person={person} isFirst={i === 0} />
            ) : (
              // empty chair placeholder keeps layout stable
              <span style={{ display: 'inline-block', width: 18, height: 22 }} />
            )}
          </div>
        );
      })}

      {/* Overflow indicator */}
      {count > MAX_VISIBLE && (
        <span
          className="text-[10px] font-bold ml-1 self-end mb-[2px]"
          style={{ color: '#4A7FA7' }}
        >
          +{count - MAX_VISIBLE}
        </span>
      )}
    </div>
  );
}
