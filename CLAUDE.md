# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VinSchool One "Smart Hub" — a hackathon concept (AI20K track: VinUni-VinSchool, April 2026) that adds an AI conversational layer on top of the existing VinSchool One parent mobile app. The goal: instead of parents hunting through tabs, data surfaces proactively via chat, voice, and smart notifications.

**Current state:** Pre-development. The repo contains only specifications, a user flow diagram, mock data, and UI mockup screenshots. No implementation code exists yet.

## Three Core Features

1. **Vin-Assistant** — Conversational search (text/voice). NLP classifies intent + entities, calls internal APIs, returns visual summary cards with deep-links back to the original app screens.
2. **Smart Daily Brief** — Replaces 5+ scattered push notifications with a single LLM-summarized digest sent at 19:00 each day.
3. **Actionable Notifications** — LLM extracts 3 bullet points (What? Deadline? Action?) from long school notices, with a "Read full text" fallback.

## Architecture Flow

```
Parent (text/voice)
  → NLP: Intent classification + Entity extraction
      ├─ Financial/Grade intent  → Hard-coded UI table (NO LLM generation)
      ├─ General info intent     → API calls → LLM summary → Visual card + deep-link
      └─ Low confidence          → Error message + 3 suggested topics
```

All responses must include a deep-link button to the original data screen (grounding/trust strategy).

## Critical Constraints

- **No LLM for financial or grade data.** Hallucinating a tuition amount (e.g., 110.520.000đ → 110.000đ) is a fatal error. For tuition/scores, AI only routes to the correct hard-coded UI screen.
- **StudentID scoping.** Every prompt/API call must be scoped to the currently selected student (multi-child families). Never mix data between students.
- **Vietnamese synonym mapping.** Build a domain-specific synonym dictionary before NLP processing (e.g., "tiền ăn trưa" = "Phí dịch vụ bán trú", "Toán tiếng anh" = "CIE Maths").
- **Latency target:** < 1 second for lookup queries.

## Key Files

| File | Purpose |
|------|---------|
| `Spec_draft.md` | Full product spec: AI canvas, user stories, failure modes, ROI |
| `Userflow.md` | Mermaid diagram of the Vin-Assistant interaction flow |
| `AI20K_VinSchoolOne_Mockdata.xlsx` | Mock data: students, courses, assignments, menus, tuition, attendance |
| `IMG_*.webp / *.png` | UI mockup screenshots of current app screens |

## Success Metrics

| Metric | Target | Red Flag |
|--------|--------|----------|
| Time-to-Information | < 10 seconds | > 4 clicks required |
| Search Success Rate | > 85% | < 70% |
| Notification Open Rate | > 60% (Smart Daily Brief) | Users disable push notifications |
