# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: university students who want to join their department's club, find and register for events, and respond to blood requests.

Also served: faculty, club moderators (committee members), department admins and one super admin. They use the same platform with different permissions.

## Product Purpose

UniConnect is a multi-department university club management platform. It covers the full club lifecycle: membership, events, announcements, blood donation coordination and an AI chatbot, in one role-based system. V1 supports the CSE, ECE and BBA departments.

Target outcomes, from the PRD. These are goals, not achieved results, so they must not appear as claims:

- 80%+ of members enroll online within the first semester.
- All department events are managed through the platform.
- Blood requests are fulfilled within 24 hours.
- The chatbot resolves 60%+ of common queries.

## Positioning

One platform that links department clubs, cross-department events and an emergency blood network under a single account and role model. The chatbot only answers from what the signed-in user is allowed to see.

## Capabilities and Constraints

- **Clubs:** club pages, committee positions with terms, paid monthly or yearly memberships through SSLCommerz.
- **Events:** `public` or `members_only` visibility, cross-department participation, registration with a hard capacity cap, and manual check-in.
- **Blood:** donor records verified by admins, and blood requests with `pending`, `fulfilled`, `cancelled` and `expired` states.
- **AI:** a RAG chatbot on Google Gemini, with visibility rules applied before retrieval.
- **Accounts:** self-registration with email verification, no approval step. This is the PRD default, with open decisions still pending in `docs/DECISIONS.md`.
- **Roles:** exactly five: `student`, `faculty`, `moderator`, `dept_admin`, `super_admin`.
- **Language and locale:** English, `Asia/Dhaka`.
- **Status:** the database schema, the authentication API and pages (registration, sign-in, email verification, password reset), the public landing page, the signed-in workspace shell for every role, an account overview and profile management (details, academic fields, avatar, password) exist. Club, event, blood and chatbot features aren't built yet.

## Evidence on Hand

Requirements are in `docs/UniConnect_PRD_V1.md` and `docs/DATABASE_SCHEMA_V1.md`.

There are no real events, users, testimonials, partner universities or usage figures yet. Don't invent any. Demonstration data must be labelled as sample data.

## Product Principles

- Speak to students first. Admin capability supports the student experience in public-facing copy.
- Show what the product does rather than claim outcomes.
- Be plain about access: who can see or join something is always clear.
- In blood requests, urgency and clarity outrank everything else.
