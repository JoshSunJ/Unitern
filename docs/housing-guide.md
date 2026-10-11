# Housing and neighborhood chat

The root layout mounts one persistent, accessible chat window. It follows public
listing detail pages, remembers the last selected listing across client-side
navigation, and keeps separate conversations for each listing/selected area.
History exists only in browser memory. The API does not log questions or store
conversations in Postgres. Closing/reopening retains the chat; reloading clears it.

## Free model configuration

Model: `gemini-3.5-flash-lite`, fixed on the server. It currently offers free
input/output tokens: https://ai.google.dev/gemini-api/docs/pricing.
Use a Gemini project with **billing disabled**. A free model name alone does
not guarantee free requests in a billed project. Never enable billing or silently
fall back to a paid provider/model. Google 2.5 Flash-Lite currently rejects new
users, so the implementation uses the successfully probed 3.5 Flash-Lite.

Create a dedicated key restricted to `generativelanguage.googleapis.com`, store
it as `unitern-gemini-api-key` in Secret Manager, and enable Terraform
`housing_chat_enabled`. Only the existing app runtime reads the secret.
Without `GEMINI_API_KEY`, the guide clearly reports it is unavailable.
Provider quota errors return 429 with a retry delay; the UI preserves the question.
Shared database counters cap requests at 3/minute/network, 4/minute globally,
and 50/day globally. These are app limits, not a claim about Google's quota;
Google's free capacity can be lower. There are no background inference calls.

Google's unpaid-service terms allow model improvement and human review. Before
sending, users confirm they are adults and understand the data notice; the API
also requires this confirmation. Questions and selected public listing/area
details go to Google. Account identifiers, contact details, user conversations,
affiliation records and credentials are not retrieved for the prompt.
The chat must remain gated to adult users. https://ai.google.dev/gemini-api/terms

## Evidence and limits

The backend retrieves a small projection of an active listing from Postgres;
client-supplied listing text is rejected. Filled/expired listings are not used.
Selected map areas are validated separately and never override listing coordinates.
Area questions refer to a selected pin, not an independently verified housing address.

Nearby named amenities come from OpenStreetMap's public Overpass API, within
1,500 meters. Numeric coordinates form a fixed, bounded query. Up to 20 named
places are supplied, at most 3/category; duplicate/invalid records are discarded.
A bounded per-instance one-hour cache reduces requests; failures are cached for
one minute. Source links attribute OpenStreetMap contributors.
https://wiki.openstreetmap.org/wiki/Overpass_API

Distances are approximate straight-line miles, never walking/commute times.
Missing coordinates, map omissions and outages are unknowns, not model guesses.
Hours, reviews and availability are not verified.

No block-level crime dataset is provided. The model must not label or rank areas
by safety, infer safety from amenities/demographics, or invent crime statistics.
It offers practical checks and official resources. The San Jose Police/FEMA
links are resources to consult, not data fetched by the chat. Lease questions
receive general move-in checks rather than individualized legal/financial advice.

Structured model output may cite only supplied source IDs. Source URLs come
from the server, never the model. React renders answers as text, not HTML.
Same-origin requests, bounded payloads/history, timeouts and shared limits protect
the endpoint. Only public, non-personal questions may be used for live probes.
Do not run integration tests or create demo listings in staging.
