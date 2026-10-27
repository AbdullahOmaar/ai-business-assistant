# Individual Month-One Plan — Technical Lead

**Participant:** AbdullahOmaar  
**Role:** Product/technical lead and active learner  
**Duration:** Four weeks  
**Related plan:** [Team Month-One Roadmap](./TEAM_MONTH_ONE_PLAN.md)  
**Status:** Proposed; review and adjust weekly

## Main objective

Lead delivery of a small, real product slice while rebuilding independent coding recall, improving technical English, and becoming more deliberate about reading official documentation. Avoid becoming only a prompt writer or blindly accepting generated code.

## Time budget

Target 60–120 minutes on each working day:
- 10–15 min: recall yesterday's concept without looking.
- 15–25 min: read the relevant official documentation.
- 25–50 min: implement/review a small change with AI assistance.
- 10–20 min: tests, explanation, and learning log.

If time is limited, reduce scope rather than skipping tests or review.

## Week 1 — Architecture, repository literacy, and Python/FastAPI recall

### Focus
- Rebuild the mental model of the product and repository.
- Resolve architecture conflicts before expanding implementation.
- Inspect the existing FastAPI starter instead of duplicating it.

### Tasks
- [ ] Review open architecture PRs/issues and write a concise conflict/decision matrix.
- [ ] Keep Angular + FastAPI + PostgreSQL labelled provisional until the relevant proposal is reviewed.
- [ ] Read the existing `backend/app/main.py` and `backend/tests/test_main.py`; explain every important part.
- [ ] Verify which local/test/CI checks actually ran; distinguish no result from a pass.
- [ ] Write a local setup checklist and a task Definition of Done.
- [ ] Create a personal learning note with 10 English technical terms.

### Learning goals
Explain without copying:
- route / endpoint
- HTTP GET and status code
- JSON response
- test assertion
- virtual environment and dependency

### Evidence
Architecture review note, linked documentation, and one short explanation of the health endpoint.

## Week 2 — API correctness and testing

### Focus
Understand API behavior, tests, and failure modes before building more endpoints.

### Tasks
- [ ] Review FastAPI path operations and Pydantic request/response concepts as relevant.
- [ ] Run the backend tests locally or document precisely why this is blocked.
- [ ] Improve one small test or behavior in a dedicated branch.
- [ ] Define the first business workflow with acceptance criteria and sample data.
- [ ] Draft domain model notes without implying persistence/authentication already exists.
- [ ] Review the trainee's small PR and explain one useful suggestion.

### Learning goals
Explain:
- type hint
- fixture / test client
- expected vs actual result
- validation
- separation of concerns

### Evidence
A reviewed PR, actual test output, workflow specification, and recall note.

## Week 3 — Angular/API vertical slice

### Focus
Connect one minimal frontend behavior to the backend if architecture and local setup are ready.

### Tasks
- [ ] Review Angular project state and official Angular HTTP documentation.
- [ ] Design the smallest useful component/service flow for backend health.
- [ ] Implement or coach the implementation of loading, success, and error states.
- [ ] Review URL/environment configuration; avoid hardcoded production endpoints.
- [ ] Add an appropriate test or document repeatable manual verification.
- [ ] Review the end-to-end request/response sequence with the trainee.

### Learning goals
Explain:
- component
- service and dependency injection
- HTTP client
- Observable / asynchronous response
- loading and error state

### Evidence
A draft PR, a request-flow explanation, and a test/verification report.

**Fallback:** If the Angular app or architecture is not ready, use this week to prepare a small implementation plan and a testable API contract; do not invent a frontend structure or rush a duplicate scaffold.

## Week 4 — Quality, domain correctness, and next-month planning

### Focus
Review correctness and document limits before adding complexity.

### Tasks
- [ ] Review the chosen business workflow against acceptance criteria and edge cases.
- [ ] Write a domain-risk note for financial correctness, currency, authorization, tenant isolation, and auditability.
- [ ] For future monetary fields, specify decimal/numeric representation; never use binary floating point for money.
- [ ] Distinguish invoice value, payments, allocations, outstanding balance, expenses, and profit in domain definitions.
- [ ] Review code and tests for the month's delivered slice.
- [ ] Prepare a month-end review and prioritized next-month backlog.
- [ ] Complete the 1/3/7/14-day recall review for previous concepts when due.

### Learning goals
Explain:
- invariant
- authorization vs authentication
- tenant isolation
- edge case
- regression test

### Evidence
Month-end review, risk note, and next-month backlog.

## Daily personal checklist

- [ ] I can state the product behavior before asking AI to code.
- [ ] I made a prediction about behavior or likely failure.
- [ ] I read at least one relevant official documentation section.
- [ ] I can explain the change without reading the generated explanation.
- [ ] I checked the actual test result, or documented the blocker.
- [ ] I recorded 3–5 English terms and one question.
- [ ] I committed on a focused branch and opened/reviewed a PR when appropriate.

## Weekly self-assessment

Rate each 1–5 and add evidence:
- I can explain the code.
- I can modify a small part without a full AI rewrite.
- I can find relevant official documentation.
- I can read a test failure and identify a next debugging step.
- I can explain the technical decision in English.
- I can review the trainee's work constructively.

Do not judge success by lines of code or number of commits. Judge it by working behavior, evidence, understanding, and safe decisions.

## Learning log template

Copy this into a dated Markdown note:

```md
# Learning Log — YYYY-MM-DD

- Product goal:
- My prediction:
- What I read (official link):
- 3–5 English terms:
- What changed:
- Test/check run and actual result:
- Explain it from memory:
- What remains unclear:
- Review dates: +1 / +3 / +7 / +14 days
```
