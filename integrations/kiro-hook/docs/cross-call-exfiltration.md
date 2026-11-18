# Cross-call exfiltration: what the records can and cannot do

The Ghost_Gate rehearses one tool call as one Plan and judges that Plan alone. A secret that is read in one tool call and sent in a later tool call is therefore two separate Plans. This note states what the Ghost_Log and the Graveyard can do about that, and what they cannot do.

## What the records can do

- After the fact, `ghost_trace` and the `links` of a Grave_Entry can show that text which the agent read in an earlier call contains the destination of a later blocked or warned action. Example: a README fetched earlier holds a destination (such as `setup-check.example`) hidden in Tag_Characters, and a later command sends data to that host.
- The statistics and the Ghost_Log support a human review of a session: what was read, what was rehearsed, and what was blocked or warned.

## What the records cannot do

- They cannot block a later call, cannot raise it to `warn`, and cannot change the verdict of a later call in any way.
- A secret read in call A and sent in call B are two Plans. The gate rehearses call B alone. The P6 behavior criterion (a secret read, then an unapproved network attempt, inside one Plan) does not fire for B, so P6 stays "within one tool call".
- They record only what a hook receives. Text that the agent obtained through a tool outside the matchers is not recorded.

## Rules that keep it this way

- The gate never reads the Provenance_Log to decide. A source-scan test (`tests/source-scan.test.mjs`) enforces this.
- The red thread is built after the verdict is fixed. It is a report, not an input to the verdict.
- The red thread finds literal occurrences only. A destination that is split, encoded, or compressed in the source text is not found, and a `not-found` link does not mean the destination is safe.

## For a human reviewer

Use `ghost_trace` with the id of a blocked or warned run to see the earlier text that mentions its destination. Treat a found link as a lead to inspect, and a missing link as no information.
