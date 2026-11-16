# Solace 2.0 — Project and Technical Presentation Guide

This document describes the implementation in this repository, including the existing wellbeing assistant, the Mentor Connect additions, demo data, data flows, setup, limitations, and questions that may come up during a project presentation. It reflects the code currently present in the repository; it distinguishes implemented behavior from future work.

## 1. Project summary

Solace is a mental-wellbeing support web application. A signed-in user can have private conversations with an AI support assistant, review mood trends over time, connect with a human wellbeing mentor, request free sessions, message the other session participant, and join a video room for an accepted session. Mentors maintain their own profile and availability and manage requests and sessions.

The AI assistant provides supportive guidance, not diagnosis or emergency care. The mentor feature provides peer or self-described professional profiles; qualifications are not verified by the platform. Users can save trusted contacts and opt in a contact to receive a minimal email when the configured safety threshold is detected. Solace does not automatically call or text those contacts.

## 2. What changed from the earlier application

The earlier application was centered on account login, a user dashboard, AI chat, and mood tracking. This version extends that application rather than replacing its authentication or AI chat.

| Area | Earlier baseline | Current implementation |
|---|---|---|
| Account creation | User account registration and login | Registration offers User or Mentor roles; the existing user login and stored accounts remain supported |
| Mentor access | No complete mentor discovery/booking workflow | Mentor profile onboarding/editing, public discovery and filters, profile detail, availability, booking, session status, and a mentor session dashboard |
| Human conversations | AI assistant conversation | Private session chat between the two booking participants, persisted in MongoDB and refreshed by polling every five seconds |
| Video support | No mentor video room | Jitsi Meet embedded in the app for accepted session participants; the meeting room name is not exposed in ordinary session listings |
| AI chat history | Conversation text and user-message mood/safety flags | Assistant replies now also retain an agent snapshot: mood, confidence, safety assessment, RAG summary, response plan, follow-up, resources, and processing time. Historical assistant replies can expand to show it |
| Safety settings | Safety analysis in the AI pipeline | User-managed trusted contacts, a separate email-alert opt-in, configured threshold, provider-backed email delivery, and visible send status |
| Presentation data | No complete, repeatable mentor demo environment | `npm run seed:demo` builds marked fictional accounts, mentor bookings, human-session chats, and an 18-conversation AI/mood timeline spanning 29 days |
| Signup form behavior | The field component was declared inside the Signup component, so each keystroke recreated the component type and remounted its input, losing focus after one character | The reusable Field component now lives at module scope, preserving the input identity and focus while controlled React state updates; role selection is available before submission |

The system still uses the original React/Express/MongoDB architecture and keeps the existing chat APIs. MongoDB fields added for demo flags have defaults, so older records continue to deserialize without migration. A standalone Memory Agent, Socket.IO server, or WebRTC implementation is not present in this repository; the implementation uses saved conversation context, REST/polling, and Jitsi Meet instead.

## 3. Technology and architecture

### Frontend

- React with React Router, Create React App scripts, Axios, and Tailwind configured in the existing client.
- `client/src/App.jsx` defines public, protected, and role-aware navigation/routing.
- `client/src/context/AuthContext.jsx` owns authentication state and the JWT token used by API requests.
- `client/src/services/api.js` centralizes requests to the Express API.
- Pages include Login, Signup, Home, Chat, Mood Analytics, Mentor Connect, Mentor Onboarding, and Meeting Room.
- Shared conversation components render AI exchanges and participant-to-participant session messages.

### Backend

- Node.js and Express with Mongoose models and controllers.
- JWT authentication middleware protects account, chat, session, message, meeting, and profile operations as appropriate.
- Existing user and chat routes are retained; `/api/mentor` contains mentor discovery and session operations.
- The AI pipeline coordinates analysis, safety, RAG knowledge retrieval, and response generation in `server/src/services/orchestrator.service.js`.

### Database models

| Model | Purpose |
|---|---|
| `User` | Account, password hash, role, trusted contacts, emergency preferences, active state, and optional demo marker |
| `Chat` | AI conversation title, messages, timestamps, mood summary, sensitive-content marker, demo identity, and persisted per-reply agent snapshots |
| `MoodLog` | Per-user mood classification, confidence, trigger text, indicators, reasoning, time context, and timestamp |
| `SafetyLog` | Non-none safety events, risk score/category, assessment, response, and resolution metadata |
| `MentorProfile` | Mentor background, peer/professional distinction, expertise, self-reported qualifications, languages, bio, approach, schedule, and duration |
| `MentorSession` | User, mentor, start/end time, private meeting room, request note, status, summary, active-slot lock, and demo marker |
| `MentorMessage` | Session-scoped message sender, content, and timestamp |
| `TrustedContactNotification` | Per-recipient safety-email status, provider message ID, and per-chat deduplication key |

## 4. Sign-in, roles, and onboarding

1. Signup creates either a `user` or `mentor` account. Passwords are hashed with bcrypt in the User model.
2. Login produces the existing JWT-based authenticated session. The client attaches that token to protected API calls.
3. Existing users are not required to re-register. Their role defaults to `user` if the stored record predates the role field.
4. A mentor account is routed to Mentor Onboarding. The mentor supplies profile text, areas, languages, mentor type, optional photo URL, availability, and session length. Existing mentor profiles load into the same form for editing.
5. Saving publishes the mentor profile immediately. The profile explicitly distinguishes peer wellbeing mentoring from a self-described qualified professional. Any listed qualification is self-reported and not verified by Solace.
6. Only suspended profiles are hidden/blocked from discovery; there is no operational verification/review queue in the current implementation. A mentor does not receive the user’s AI chat history.

## 5. Mentor Connect and booking workflow

### Discovery and profile

Users can find published profiles and filter by mentor name, area of expertise, and language. The mentor page shows profile background, self-reported type/qualifications, expertise, languages, experience, approach, availability, and session duration. Sessions are free; the interface does not integrate payments.

### Availability and booking

1. The client asks for available times for a selected UTC calendar date.
2. The API builds slots from that mentor’s recurring weekday/time windows and session duration.
3. Slots in the past and slots overlapping a pending or accepted booking are removed.
4. The user selects a slot and can provide an optional note.
5. The server validates future time, weekday, alignment to the mentor’s duration, published availability, and overlap before creating the pending request.
6. A MongoDB unique partial index on mentor/start/active slot is a second line of defense against concurrent requests for the same start time. A duplicate-key result becomes HTTP 409 so the user can choose a different slot.

### Session states

The implemented status values are `pending`, `accepted`, `rejected`, `cancelled`, and `completed`.

- A mentor can accept or reject a pending request.
- A user can cancel a pending request.
- A user can cancel a future accepted session.
- A mentor can mark an accepted session completed after its start time and save an optional summary.
- Rejected, cancelled, and completed sessions release their slot lock. Pending and accepted sessions hold the slot.
- Each signed-in participant sees only sessions where they are the user or the owning mentor.

## 6. Human session chat and video

### Session chat

`MentorMessage` records each message against a specific `MentorSession`. The API checks that the sender is either that session’s user or its mentor before returning or accepting messages. The frontend reloads the message list every five seconds and after sending, so it is near-real-time polling rather than a Socket.IO push connection. Mentors have session chat only; there is no separate mentor-to-user chat outside a booking.

### Video room

An accepted session has a Join Video Session action when its scheduled join window is open. The protected meeting endpoint verifies participant identity and accepted status, then returns the room name. `MeetingRoom.jsx` loads the Jitsi Meet External API and embeds the Jitsi room with the participant’s display name. The browser asks for camera/microphone access. The room identifier is stored on the session and excluded from normal session serialization. Demo accepted sessions have an intentional time-window bypass so the presentation can demonstrate the video entry point; normal sessions keep the scheduled window.

This is an embedded Jitsi meeting, not a custom WebRTC signaling server. The actual audio/video transport, browser permissions, and meeting reliability depend on Jitsi and the user’s network/browser.

## 7. Solace AI assistant: request-to-response pipeline

The authenticated client sends `POST /api/chat/message` with message text and, when continuing a thread, the chat ID. The orchestration service runs these steps:

1. **Conversation context:** loads up to the last ten messages from the selected chat. This is recent chat history, not a separately implemented long-term memory agent.
2. **Combined analysis:** `analysis.service.js` analyzes message/context and yields mood, safety, and a response plan.
3. **Mood tracking:** a `MoodLog` is written for each user message. Mood values include happy, sad, anxious, angry, neutral, stressed, hopeful, confused, overwhelmed, and calm; confidence, indicators, reasoning, timestamp, and time context are retained.
4. **Safety assessment:** non-none findings can create a `SafetyLog`. High/crisis results take the safety response path, provide emergency resources, mark the exchange, and do not proceed through ordinary RAG generation.
5. **RAG retrieval:** `rag.service.js` retrieves relevant entries from the local knowledge base based on the user message and mood. The retrieved text is included when generating supportive guidance.
6. **Response plan:** the analysis chooses a strategy such as empathetic support, coaching, reflective support, informational support, or skill building and specifies a primary focus.
7. **Response generation:** `response.service.js` uses the configured Gemini-compatible API when available and has a template-based fallback path.
8. **Persistence:** both user and assistant messages are saved in `Chat`. The assistant message now stores a compact `agentSnapshot` containing mood/confidence/indicators, safety level/score/categories/trigger phrases/assessment/action flag, RAG count/categories, response strategy/focus/key points/tone, follow-up, resources, and processing time.
9. **History and analytics:** `GET /api/chat/history`, `GET /api/chat/:chatId`, and `GET /api/chat/mood-history?days=N` return the owner’s stored chats/messages and mood aggregates/trends. The chat view makes the per-reply agent snapshot expandable.

The AI flow is supportive, not diagnostic. Mood labels and pipeline assessments are model outputs and can be wrong. Safety handling provides resources and user-directed trusted-contact prompts; it does not replace human crisis response.

## 8. Mood analytics and stored timeline

Mood logs are independent, timestamped records linked to the user and chat. The backend computes mood distribution and daily trends for a requested number of days. The analytics page allows 7-, 14-, and 30-day views and combines mood distribution, confidence, mood trend, conversation history, and day coverage into charts and explanatory insights.

The presentation seed creates **18 fictional AI conversations across the prior 29 days**. Each conversation contains three user messages and three assistant replies. User entries have varied moods and confidence scores; individual user turns also have matching `MoodLog` entries with indicators, reasoning, day-of-week, time-of-day, and linked chat IDs. Assistant entries have example agent snapshots so the expanded historical analysis UI has content to show. The timeline moves through academic pressure, interviews, relationships, routines, and small wins to demonstrate changing moods rather than repeating one day.

These seeded classifications and assistant responses are sample data, not outputs produced by the live AI pipeline. Records carry demo markers and are shown under a clearly identified demo account. The demo seed does not synthesize data for every real account and does not overwrite non-demo accounts or profiles.

## 9. Trusted contacts and emergency preferences

Users can configure trusted contacts, separate email-alert consent for each person, whether the app should surface contact details, and the risk threshold (`crisis` or `high`). A qualifying safety assessment submits each email opted-in contact a minimal alert through Resend. The message says a serious safety concern was detected and asks them to check in; it contains no user message or chat history. Provider acceptance status is stored and displayed, and repeat alerts are deduplicated per contact per chat thread. Inbox delivery is not confirmed because delivery webhooks are not implemented. Calls remain manual and Solace does not send SMS. This feature is not a replacement for emergency services.

Configure `RESEND_API_KEY` and `TRUSTED_CONTACT_FROM_EMAIL` in `server/.env` with an authorized sender address, then restart the backend. Existing contacts are **not** opted into email by default: each contact must separately agree to receive Solace safety alert emails and the user must save those settings. If delivery is not configured or fails, the user sees that status and can use the manual contact links.

## 10. Main API map

All paths are under `/api`; mentor paths are mounted under `/api/mentors`.

| Method and path | Purpose | Access |
|---|---|---|
| `POST /auth/signup` | Register a user or mentor role | Public |
| `POST /auth/login` | Authenticate and issue JWT | Public |
| `GET /auth/me` | Return current authenticated account | JWT |
| `POST /chat/message` | Run Solace AI pipeline and persist exchange | JWT |
| `GET /chat/history?limit=N` | List current user’s chat threads | JWT |
| `GET /chat/:chatId` | Read a current user’s saved thread | JWT + ownership |
| `GET /chat/mood-history?days=N` | Mood distribution and trend | JWT |
| `GET /mentors` | List discoverable profiles with optional search/filter query | Public |
| `GET /mentors/:mentorId` | Read mentor profile | Public |
| `GET /mentors/:mentorId/availability?date=YYYY-MM-DD` | Get open UTC slots | Public |
| `POST /mentors/:mentorId/sessions` | Request a free slot | JWT user |
| `GET /mentors/sessions` | List current user’s or mentor’s own sessions | JWT |
| `PUT /mentors/sessions/:sessionId` | Update permitted session status/summary | JWT + participant/role rules |
| `GET/POST /mentors/sessions/:sessionId/messages` | Read/send session chat | JWT + participant |
| `GET /mentors/sessions/:sessionId/meeting` | Obtain accepted session room details | JWT + participant + time window (except demo) |
| `GET/POST /mentors/me/profile` | Read/create mentor profile | JWT mentor |
| `PUT /user/profile`, `/user/password`, `/user/emergency-preferences` | Maintain account settings and trusted-contact preferences | JWT + owner |

## 11. Running the project

Requirements: Node.js 18+, npm, MongoDB (local or Atlas), and a Gemini-compatible API key for live AI generation.

1. Install dependencies in `client/` and `server/` using `npm install`.
2. Configure `server/.env` from `server/.env.example`: MongoDB URI, JWT secret, Gemini key/model, port, and frontend URL.
3. Configure `client/.env` with `REACT_APP_API_URL=http://localhost:5000/api`. For local quick-fill presentation buttons, set `REACT_APP_DEMO_MODE=true` and restart the client.
4. Start the server with `cd server && npm run dev`.
5. Start the frontend with `cd client && npm start`.
6. To populate the database configured in `server/.env`, run `cd server && npm run seed:demo`.

Demo credentials (fictional):

- User: `demo.user@solace.local`
- Mentor: `demo.mentor.maya@solace.local`
- Password: `SolaceDemo!2026`
- Other mentor accounts: `demo.mentor.rohan@solace.local`, `demo.mentor.leela@solace.local`

The demo seed is repeatable for its owned demo records. It refuses to take over an account, mentor profile, session, or AI chat that is not marked/identified as demo. It replaces the seeded example messages and regenerates the demo timeline when rerun.

## 12. Suggested live demonstration

1. Sign in as the demo user and show the dashboard and existing AI assistant.
2. Open an older AI thread. Show user/assistant exchanges across different dates and expand an assistant reply to show mood, safety, RAG, response strategy, and timing fields.
3. Open Mood Analytics and switch among 7, 14, and 30 days. Explain that each user turn creates a mood log and dates are based on stored timestamps.
4. Open Mentor Connect, filter mentors, inspect the peer/professional distinction, and review a profile.
5. Show the demo user's accepted, pending, completed, cancelled, and rejected session cases and the session-specific participant chat.
6. Sign in as Maya to show the mentor view: profile editing and only her own booked/requested sessions.
7. Join the accepted demo session and show the Jitsi room. Explain that real sessions require accepted status and normal meeting-time checks.
8. Show trusted-contact settings and explain the separate consent, server email configuration, minimal alert content, and delivery status. Do not trigger a real alert to an unsuspecting contact during a presentation.

## 13. Professor questions and answer notes

### 1. Why did you extend the existing application instead of building a separate mentor app?

Mentor support complements the existing AI chat and mood tracking. Keeping the current account system, API, and MongoDB deployment avoids duplicate identity/data systems and allows users to move between AI support, analytics, and human support in one authenticated product.

### 2. How does the app authenticate protected routes?

The server issues a JWT after valid login. The frontend stores and attaches the token to protected API requests. The `protect` middleware validates it and adds the authenticated user to the request. Controllers then apply role and record ownership checks; a valid JWT alone does not grant access to another person’s session.

### 3. How do you prevent one mentor time slot from being booked twice?

The booking controller validates the requested timestamp against the mentor’s schedule and checks for overlapping active sessions. MongoDB also has a unique partial index for active `(mentor, startsAt)` reservations. The controller converts a duplicate-key race into a conflict response, so concurrent clients are asked to select another slot.

### 4. Why is there both an overlap check and a unique index?

The application check gives a friendly early error and covers interval overlap. The unique index protects the exact start-time invariant atomically when two requests pass the preliminary check at nearly the same time. The overlap query and index together reduce race-related double booking.

### 5. What does `activeSlot` mean?

Pending and accepted sessions reserve a time. Rejected, cancelled, and completed sessions set `activeSlot` false and release it. Keeping this independent from status makes the reservation index simple and allows the history to retain completed/cancelled records.

### 6. Does the mentor get access to a user’s AI conversations?

No. AI chats are queried by their owner’s `userId`; mentor session routes only return session messages linked to a booking where the requester is one of the participants. The mentor receives the optional booking note and session chat, not the user’s private Solace AI chat history.

### 7. Is mentor chat real-time?

It is persisted and updates through five-second polling, with an immediate refresh after sending. It is not Socket.IO push messaging in this version. A future improvement could replace polling with authenticated room-based Socket.IO events while retaining the same authorization rules and MongoDB history.

### 8. How does the video call work? Is this WebRTC?

Solace obtains an authorized room identifier for an accepted session and embeds Jitsi Meet using its External API. Jitsi handles signaling and WebRTC media. Solace does not implement its own WebRTC signaling layer or media server.

### 9. How does Solace analyze an AI chat message?

The orchestrator loads recent context, runs combined mood/safety/plan analysis, logs mood, writes non-none safety events, routes high/crisis cases to safety responses, otherwise retrieves relevant knowledge and generates a response. It then stores both sides of the exchange and the assistant pipeline snapshot.

### 10. What does RAG add to this project?

Retrieval-Augmented Generation fetches relevant local knowledge entries based on the message and mood and supplies them to response generation. The model can therefore use selected mental-wellbeing content as grounding context instead of relying solely on its general language-model knowledge. RAG results and categories are summarized for chat inspection.

### 11. What happens if the language model is unavailable?

Response generation has a template-based fallback for supported moods and a dedicated safety response for high/crisis results. Availability still depends on MongoDB and the application server; the fallback does not make the whole service offline-capable.

### 12. Does mood classification diagnose the user?

No. Mood is an approximate conversational signal with a confidence score, not a clinical diagnosis. The app presents trends as reflective wellbeing context and should not be used to make medical decisions.

### 13. What is stored for an AI exchange?

Chat messages and timestamps are stored in `Chat`. User messages include detected mood, confidence, and a safety flag. Assistant messages include an `agentSnapshot` with mood confidence/indicators, safety summary and triggers, RAG count/categories, response strategy/focus/key points/tone, resources, follow-up, and processing time. `MoodLog` stores a separate timestamped row per user message for analytics; `SafetyLog` stores non-none risk events.

### 14. Why have both Chat messages and MoodLog records?

Chat is the source for conversation playback. MoodLog is optimized for queries and aggregations across dates and moods, without loading every full conversation. The `chatId` link connects an analytic observation back to the conversation that produced it.

### 15. How do you keep users from accessing another user’s chat?

The orchestrator’s chat lookup filters by both `_id` and authenticated `userId`; history queries also filter by user ID. Mentor message and meeting endpoints independently check participant membership. Authorization is enforced server-side, not only by hiding UI controls.

### 16. What does the trusted-contact escalation do?

It checks the user's enabled preference and configured threshold, then emails contacts who have separately opted in using the configured Resend API. The alert contains no chat text. The app stores provider status and prevents duplicate alerts to the same contact in the same chat thread. Solace does not call or text contacts. Immediate-danger guidance also directs the user to emergency resources.

### 17. Are mentor credentials verified?

No. The interface labels mentor type and describes qualifications as self-reported. This implementation publishes a profile when the mentor saves it and does not claim a review or verification process. A production deployment would need an operational credential-review process before labeling any credential verified.

### 18. Are the seed conversations real user conversations or actual AI outputs?

No. They are clearly marked fictional examples created for demonstration. They exercise the same Chat and MoodLog fields as the application and span 29 days, but they are not live model outputs or real user records. Real user records are not modified by the guarded demo seed.

### 19. Why include an `isDemo` marker?

It provides explicit provenance, enables visible demo labels, and limits the seed script’s updates/deletions to its own sample records. Defaults preserve compatibility for documents created before the marker existed.

### 20. What are the main current limitations?

Mentor credentials are self-reported, mentor chat uses polling, Jitsi is an external dependency, demo content is fictional, the memory context is limited to recent messages in a selected chat, and the platform is not a clinical or emergency-response service. These are clear next steps for governance, real-time scaling, privacy review, and clinical safety evaluation.

### 21. How would you scale the chat and booking system?

For chat, introduce authenticated Socket.IO rooms or a managed event service, keep MongoDB as durable history, and use a message/event queue for delivery and retries. For bookings, retain database-level uniqueness, use transactions where multiple records must change atomically, add indexes for frequent range queries, and consider a dedicated availability/locking strategy if scheduling volume grows.

### 22. How would you improve privacy and production readiness?

Add documented retention/deletion controls, encryption and secret management, audit access to sensitive data, rate limits and abuse controls, secure media/meeting configuration, verified mentor governance, accessibility testing, threat modeling, and clinical review of crisis language. Never present the platform as a substitute for qualified care.

## 14. Important implementation boundaries

- No payment flow is present; mentor sessions are free.
- No mentor identity/qualification review queue is present; profiles publish on save.
- No ratings or testimonials are fabricated.
- No separate mentor-to-user messaging channel exists; chat belongs to a session.
- No Socket.IO runtime is configured; session messages use REST polling.
- No custom WebRTC signaling implementation exists; embedded Jitsi provides meetings.
- Trusted-contact email requires a configured Resend API key/sender and explicit per-contact consent; Solace does not send SMS or place calls.
- No standalone Memory Agent is implemented; recent conversation messages are included as context.
- Seed data is limited to the named demo accounts and is not inserted for all registered users.

