import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import { assertLiteralAllowed, createSafeLookup, policyFor, type NetworkPolicy } from "./network";

// fetch() that refuses to connect to addresses the policy doesn't allow.
// Every new connection goes through the connector below, redirect hops
// included, so a public URL that redirects to an internal one is stopped too.
// Worker-only (undici is bundled into the worker image).

function createSafeAgent(policy: NetworkPolicy): Agent {
  const connect = buildConnector({ lookup: createSafeLookup(policy) });
  return new Agent({
    connect: (opts, callback) => {
      try {
        assertLiteralAllowed(opts.hostname, policy);
      } catch (err) {
        callback(err as Error, null);
        return;
      }
      connect(opts, callback);
    },
  });
}

export function createSafeFetch(policy: NetworkPolicy): typeof fetch {
  const dispatcher = createSafeAgent(policy);
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    undiciFetch(input as never, { ...init, dispatcher } as never)) as unknown as typeof fetch;
}

const cache = new Map<boolean, typeof fetch>();

/** The shared fetch for monitors that are (true) or aren't (false) approved for private targets. */
export function fetchFor(allowPrivate: boolean): typeof fetch {
  let f = cache.get(allowPrivate);
  if (!f) cache.set(allowPrivate, (f = createSafeFetch(policyFor(allowPrivate))));
  return f;
}
