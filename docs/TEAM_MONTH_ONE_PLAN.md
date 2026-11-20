# AI Business Assistant — One-Month Team Roadmap

**Status:** Proposed working plan — review before treating as final  
**Duration:** 4 weeks / 20 working sessions  
**Owners:** Product/technical lead (AbdullahOmaar) and trainee developer (`totokabil958`)  
**Repository:** [AbdullahOmaar/ai-business-assistant](https://github.com/AbdullahOmaar/ai-business-assistant)

## 1. Why this plan exists

We have two equally important outcomes:

1. **Build a real product:** an AI Business Assistant for small businesses.
2. **Build engineering capability:** strengthen the lead's coding recall and technical English, while giving the beginner trainee a safe, structured path to contribute.

We will use **guided AI-assisted development / vibe coding**, but not blind code generation. Every meaningful change should have a clear goal, a small implementation, tests or a documented verification method, a review, and a short learning record.

## 2. Product scope for month one

Aim for a small, reviewable vertical slice—not a production-ready financial platform.

### Target outcome by the end of the month
- A reviewed architecture proposal and documented decisions.
- A repeatable local development setup documented in the repo.
- A minimal FastAPI backend with health endpoint and automated tests.
- A minimal Angular frontend that can call the backend health endpoint, if local setup and the architecture decision are ready.
- Initial business-domain design documented and reviewed.
- A first small business workflow chosen and specified; implement it only if foundations and tests are stable.
- Separate learning evidence from both team members: vocabulary, documentation links, explanations, and review notes.

### Explicitly out of scope for month one
- Production deployment or paid infrastructure.
- Replacing or reconfiguring Firebase.
- Merging existing or new PRs without Abdullah's approval.
- Handling real customer financial data.
- Claiming multi-tenant security, authentication, authorization, database migrations, or production readiness before these are implemented and tested.
- Letting an AI model create or execute financial transactions without human approval.

## 3. Working assumptions

- Suggested stack, still subject to review: **Angular + Python/FastAPI + PostgreSQL**.
- GitHub is the shared source of truth; keep decisions, tasks, and learning notes there rather than relying on Notion.
- The trainee is a beginner. Assign bounded tasks with acceptance criteria and no production secrets.
- Plan around **60–120 minutes per person per working day**, five days a week. If actual availability differs, preserve the sequence and reduce scope rather than skipping reviews.
- No paid services are required for this plan. Use local development and GitHub's available free capabilities.
- Firebase currently exists in the project; this plan does not authorize changes to it.

## 4. Team operating agreement

1. Start work from a focused issue and a feature branch.
2. Read the task and predict the expected behavior before asking AI to generate a solution.
3. Check official documentation for unfamiliar or security-sensitive behavior.
4. Keep changes small. Avoid unrelated refactors.
5. Add or update tests for behavior changes.
6. Open a PR; do not push directly to `main`.
7. A PR is not complete until its author can explain the change, tests are checked, and the accountable maintainer has completed and documented full self-review; any formal GitHub branch-protection approval actually enforced remains mandatory.
8. **Do not merge PRs without Abdullah's explicit approval.**
9. Never commit credentials, tokens, private customer data, or real business records.
10. If blocked for more than 20–30 minutes, write what was attempted, the error, and the next question in the issue. Do not silently copy an unexplained fix.
11. Mark checks as passed only when they actually ran and their results are visible.
12. Use mock/sample data only.

## 5. Four-week roadmap

### Week 1 — Align, understand, and establish a safe baseline

**Shared objective:** understand the product and repository, resolve conflicting architecture proposals, and make local work reproducible.

**Lead**
- Review current open PRs and issues, especially architecture-related proposals, before adding overlapping decisions.
- Write a short architecture comparison and decision criteria: learning curve, delivery speed, maintainability, testing, deployment cost, and future integrations.
- Keep Angular + FastAPI + PostgreSQL labelled as a proposal until reviewed; reconcile any competing Spring Boot proposal.
- Review the existing FastAPI starter and its tests; confirm what is implemented versus only planned.
- Create a local setup checklist and a definition of done.

**Trainee**
- Read the product overview and repository contribution instructions.
- Learn Git basics: repository, branch, commit, push, pull request, review.
- Inspect the FastAPI health endpoint and test; write a plain-English explanation of request, response, status code, and test assertion.
- Create a glossary of 10 terms and link each to official documentation where applicable.
- Make one documentation-only change on a branch and open a PR.

**Week 1 deliverables**
- Architecture options and unresolved questions documented.
- Existing PR conflict map; no PR merged automatically.
- Local setup and verification checklist.
- One small trainee documentation PR and a learning note from each person.

**Exit criteria**
- Both people can explain the product's first-month scope and the GitHub PR flow.
- The team agrees what is still undecided and what can be safely built next.

### Week 2 — Backend fundamentals and reliable API behavior

**Shared objective:** understand and verify the API foundation rather than adding multiple features at once.

**Lead**
- Review Python typing, FastAPI routing, request/response behavior, dependency boundaries, and pytest/TestClient.
- Improve health endpoint tests where useful (success status and response body).
- Decide and document the first domain workflow, preferably a read-only or low-risk workflow using sample data.
- Draft a data model proposal and explicitly identify what requires database migrations and authorization later.

**Trainee**
- Learn Python functions, imports, type hints, dictionaries, exceptions, and pytest assertions.
- Add or improve a small test with coaching; do not create broad models or database changes alone.
- Practice reproducing a failing test, reading the error, fixing one cause, and rerunning the test.
- Write a short note explaining the endpoint and its test without copying the source line by line.

**Week 2 deliverables**
- Backend tests with recorded, real results.
- One reviewed API behavior or test improvement.
- A domain workflow specification with sample request/response and edge cases.
- A short backend vocabulary and recall quiz for each person.

**Exit criteria**
- The team can describe what the test proves and what it does not prove.
- No claims of database persistence or authorization unless implemented and tested.

### Week 3 — Frontend-to-backend vertical slice

**Shared objective:** connect one small Angular UI interaction to the API, only after the architecture and local setup permit it.

**Lead**
- Confirm Angular project structure and local commands from the repository.
- Implement or guide one minimal service/component interaction for the health endpoint.
- Handle loading, success, and error states; avoid hardcoding a production URL.
- Review frontend/backend contract and ensure the UI does not imply that health status proves full system health.

**Trainee**
- Learn Angular component, template, service, dependency injection, and Observable/HTTP basics from official docs.
- Build a small, bounded UI task such as a clear status display or loading/error message.
- Add a test or documented manual verification steps appropriate to the project setup.
- Explain the data flow from click/page load to Angular service, HTTP request, FastAPI route, and response.

**Week 3 deliverables**
- A small vertical slice in a draft PR.
- Frontend/backend run instructions and an evidence-based test report.
- A diagram or written sequence showing the request/response flow.

**Exit criteria**
- The slice works locally if the environment is available; otherwise the blocker is documented honestly.
- Tests and manual checks are clearly distinguished.

### Week 4 — Domain modeling, quality review, and consolidation

**Shared objective:** strengthen quality and decide the next month based on evidence.

**Lead**
- Review the first business workflow and data model against correctness, privacy, authorization, and future multi-tenant isolation.
- Document money-handling rules before any money-related feature: use decimal/numeric types, define currency handling, distinguish invoice amount, payments, allocations, outstanding balance, expenses, and profit.
- Review test gaps, error handling, accessibility/usability, and security assumptions.
- Prepare a month-end decision log and prioritized backlog.

**Trainee**
- Fix one small, maintainer-self-reviewed issue or add edge-case tests.
- Review another PR using a checklist and ask constructive questions.
- Produce a short learning summary: what I can now explain, what I can do with help, and what remains unclear.
- Rebuild or explain one small piece without copying a previous answer, then compare with the implementation.

**Week 4 deliverables**
- Reviewed small feature or test improvement.
- Month-end engineering review and backlog.
- One learning summary and vocabulary review per person.
- Proposed next-month goals based on actual progress, not planned progress.

**Exit criteria**
- The team can demo or clearly describe the delivered slice.
- Known limitations and unverified areas are listed.
- Next steps are prioritized and assigned.

## 6. Suggested weekly rhythm

| Session | Focus | Evidence |
|---|---|---|
| Day 1 | Define goal, inspect docs, predict behavior | Issue checklist and prediction |
| Day 2 | Implement a small slice | Branch/commit |
| Day 3 | Test and debug | Test output or blocker notes |
| Day 4 | Review, explain, revise | PR review and explanation |
| Day 5 | Active recall and retrospective | Learning note and next-week plan |

This is a flexible rhythm, not a rigid calendar. Do not force a feature to finish on Friday if evidence shows it needs more review.

## 7. Definition of done

A task is done when:
- [ ] The behavior and acceptance criteria are clear.
- [ ] The change is scoped and on a branch.
- [ ] Relevant official docs were consulted and linked.
- [ ] Tests ran and their actual result is recorded, or the reason they could not run is documented.
- [ ] Error/edge cases appropriate to the scope were considered.
- [ ] The author can explain the important lines and trade-offs.
- [ ] A PR is open and reviewed.
- [ ] Learning notes and follow-up questions are recorded.
- [ ] No secrets or real customer data were introduced.
- [ ] No merge, deployment, paid service, or Firebase change happened without approval.

## 8. Learning method for both people

For each task, keep a small learning record:
1. **Goal:** what product behavior are we trying to deliver?
2. **Prediction:** what do I expect to happen, and why?
3. **Vocabulary:** 3–5 English technical terms.
4. **Official source:** the specific documentation page used.
5. **Implementation:** what changed and why?
6. **Verification:** exact test/check performed and result.
7. **Recall:** explain the idea from memory in your own words.
8. **Next review:** revisit after roughly 1, 3, 7, and 14 days.

AI can draft code and explain alternatives; the developer remains responsible for understanding, reviewing, and verifying the change.

## 9. Official documentation starting points

Use the section relevant to the task; do not read all documentation cover-to-cover.

- Python tutorial: https://docs.python.org/3/tutorial/
- Python virtual environments and packages: https://docs.python.org/3/tutorial/venv.html
- FastAPI tutorial: https://fastapi.tiangolo.com/tutorial/
- FastAPI testing: https://fastapi.tiangolo.com/tutorial/testing/
- pytest getting started: https://docs.pytest.org/en/stable/getting-started.html
- Angular tutorial: https://angular.dev/tutorials
- Angular HTTP requests: https://angular.dev/guide/http
- PostgreSQL tutorial: https://www.postgresql.org/docs/current/tutorial.html
- GitHub pull requests: https://docs.github.com/en/pull-requests
- GitHub branching: https://docs.github.com/en/get-started/using-github/github-flow

## 10. End-of-month review

Rate each item **Not started / In progress / Demonstrated** and link evidence:
- Product slice delivered or blocker documented.
- Architecture proposal reconciled and reviewed.
- Local setup reproducible.
- API behavior tested.
- Frontend/API interaction tested if included.
- Both developers can explain the request/response flow.
- Each developer has a glossary and learning log.
- PRs reviewed; no unauthorized merges.
- Security, database, and production limitations stated honestly.
- Next-month backlog prioritized.

**Important:** This roadmap is a proposal. Adjust it when the repository state, architecture review, actual availability, or test evidence requires it.