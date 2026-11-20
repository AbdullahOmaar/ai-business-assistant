# Individual Month-One Plan — Trainee Developer

**Participant:** `totokabil958`  
**Role:** Beginner developer / contributor  
**Duration:** Four weeks  
**Related plan:** [Team Month-One Roadmap](./TEAM_MONTH_ONE_PLAN.md)  
**Status:** Proposed; adjust based on demonstrated understanding

## Main objective

Learn how to contribute safely to a real team repository. Prioritize understanding, Git confidence, basic Python/API testing, and clear communication over speed or large features.

## Time budget

Target 60–90 minutes on each working day:
- 10 min: recall a previous concept.
- 15–20 min: read the assigned official documentation section.
- 20–35 min: make one small task or experiment.
- 10–15 min: explain what happened and write a learning note.

The lead should keep tasks small, define acceptance criteria, and review changes. Ask questions early; do not hide uncertainty.

## Week 1 — GitHub, project understanding, and reading existing code

### Tasks
- [ ] Read the project overview and the team month-one roadmap.
- [ ] Learn the difference between repository, branch, commit, push, pull request, review, and merge.
- [ ] Read the contribution instructions before changing code.
- [ ] Inspect `backend/app/main.py` and `backend/tests/test_main.py`.
- [ ] Explain in your own words what the health endpoint returns and what its test checks.
- [ ] Make one documentation-only improvement on a feature branch and open a PR.
- [ ] Build a glossary of 10 English technical terms.

### Expected learning
- A branch isolates work.
- A commit records a change.
- A PR proposes changes for review; it does not mean the work is automatically accepted.
- A test checks a defined expectation, not the entire product.

### Evidence
One small documentation PR, a short code explanation, and glossary.

## Week 2 — Python basics and test-first thinking

### Tasks
- [ ] Practice variables, strings, dictionaries, lists, functions, imports, and type hints.
- [ ] Read the Python tutorial sections assigned by the lead.
- [ ] Learn what an assertion checks and how to read expected/actual output.
- [ ] Add or improve one small test with guidance.
- [ ] Deliberately predict one test result before running it.
- [ ] If a test fails, record the error and investigate before changing code.
- [ ] Write a brief note: what did the test prove, and what did it not prove?

### Expected learning
- Read a short Python function and explain its input/output.
- Make a small change without reformatting or rewriting unrelated files.
- Explain the difference between a test failure and a test that never ran.

### Evidence
One reviewed test-related PR and a clear learning note.

## Week 3 — Angular and HTTP fundamentals

### Tasks
- [ ] Follow the relevant Angular tutorial section.
- [ ] Learn component, template, service, dependency injection, and HTTP request basics.
- [ ] Trace the health-status data flow with the lead.
- [ ] Take one bounded UI task, such as a loading indicator or readable error message, only after the app structure is confirmed.
- [ ] Add an appropriate test or clear manual verification steps.
- [ ] Explain how the frontend receives and displays the backend response.

### Expected learning
- A component controls a part of the UI.
- A service can hold reusable logic or HTTP calls.
- An HTTP request can succeed or fail.
- A loading state is different from a successful state.

### Evidence
One small UI PR or, if the Angular setup is not ready, a documented UI flow/acceptance criteria task.

## Week 4 — Review, debugging, and independent explanation

### Tasks
- [ ] Pick one reviewer-approved small issue or edge-case test.
- [ ] Review a teammate PR using the checklist below.
- [ ] Explain one previously completed change without copying the old answer.
- [ ] Revisit vocabulary from weeks 1–3.
- [ ] Write a month-end reflection and propose two next learning goals.
- [ ] Reproduce the feature or test steps from the README.

### PR review checklist
- Is the purpose clear?
- Is the change small and related to the issue?
- Are file names and messages understandable?
- Is a test or verification step included?
- Are there secrets or private data? (There must not be.)
- Can the author explain what changed?
- Are limitations or untested steps stated honestly?

### Evidence
One reviewed issue/PR, a month-end reflection, and a reproducible verification note.

## Official documentation

Read small sections assigned to the current task rather than trying to finish every guide.

- Python tutorial: https://docs.python.org/3/tutorial/
- FastAPI tutorial: https://fastapi.tiangolo.com/tutorial/
- FastAPI testing: https://fastapi.tiangolo.com/tutorial/testing/
- pytest getting started: https://docs.pytest.org/en/stable/getting-started.html
- Angular tutorial: https://angular.dev/tutorials
- Angular HTTP requests: https://angular.dev/guide/http
- GitHub pull requests: https://docs.github.com/en/pull-requests
- GitHub flow: https://docs.github.com/en/get-started/using-github/github-flow

## How to ask for help

When stuck, send this in the GitHub issue or PR:
1. What I expected.
2. What actually happened.
3. Exact error message or test result (remove secrets).
4. What I tried.
5. Relevant file/line or official documentation link.
6. My current guess about the cause.

Do not paste credentials, access tokens, private customer data, or production secrets into issues, prompts, commits, or screenshots.

## Learning log template

```md
# Trainee Learning Log — YYYY-MM-DD

- Task and product goal:
- My prediction:
- Official documentation read:
- New English words (3–5):
- What I changed:
- What test/check ran and result:
- Explain the behavior in my own words:
- What confused me:
- What I will try next:
- Review dates: +1 / +3 / +7 / +14 days
```

## Success criteria after one month

The trainee should be able to:
- Use a branch and open a PR without committing directly to `main`.
- Read and explain a small Python function and a simple test.
- Find the relevant official documentation.
- Make a bounded change and report what was verified.
- Ask a useful debugging question with evidence.
- Explain one frontend-to-backend request flow with help.

The trainee is not expected to independently design the production architecture, secure multi-tenant financial data, or deliver a complete feature alone in the first month.
