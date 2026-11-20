# Learning-First Development Workflow

## Status
Proposed learning workflow for owner review. This document does not approve or change the application architecture.

## Why we are building this project
AI Business Assistant has two equally important outcomes:

1. **Product outcome:** build a useful, secure business-management application for small shops and service providers.
2. **Learning outcome:** use the real project to rebuild and retain programming skills, improve technical English, and learn to work effectively with AI without outsourcing understanding to it.

Success is not measured only by the amount of code produced. The owner should increasingly be able to explain, review, test, debug, and safely change the code.

## Rules for every implementation task
1. **State the goal first.** Explain in plain Arabic what user problem this task solves and where it fits in the product.
2. **Learn the vocabulary.** Select 3–5 useful English technical terms, with a simple English definition and Arabic explanation.
3. **Read the source.** Link the relevant official documentation. Summarize the specific section used; do not treat AI output as the sole authority.
4. **Predict before revealing.** Ask the learner what they expect the code or command to do, or provide a small prediction question before showing the implementation.
5. **Build one small slice.** Keep changes small, reviewable, and tied to a visible product outcome. Avoid bulk code generation that the learner cannot explain.
6. **Explain the code.** Walk through the important lines and explain the reason for the design, including alternatives and trade-offs.
7. **Recall without looking.** Ask the learner to explain the concept in their own words and answer 2–3 short retrieval questions.
8. **Practice a change.** Give one small variation, debugging task, or test case so the learner applies the idea rather than merely reading it.
9. **Verify honestly.** Run available checks when possible and report the exact result. Clearly label checks that could not be run.
10. **Record learning in GitHub.** Add a concise learning note to the relevant issue or PR: what was learned, vocabulary, documentation consulted, test evidence, remaining questions, and what to review later.

## English-learning method
- Use the English names for code, APIs, variables, errors, and documentation concepts.
- Explain difficult concepts in simple Arabic first, then provide a short English explanation.
- Encourage reading a small, relevant section of official documentation rather than translating an entire page.
- Practice writing one or two simple English sentences about each change, such as: "This endpoint returns the API health status."
- Correct English constructively and explain the correction.

## Programming-memory method
- Prefer active recall, spaced review, and small code changes over passive rereading.
- Keep a GitHub-based learning log. Revisit a concept after approximately 1 day, 3 days, 7 days, and 14 days; adjust the intervals based on recall.
- Review old code by explaining its purpose before asking AI for help.
- Do not require memorizing every syntax detail. Prioritize mental models, debugging, reading code, architecture, security, tests, and knowing how to find reliable documentation.
- Use AI as a mentor and reviewer, not as a substitute for the learner's reasoning.

## Task completion checklist
- [ ] I can explain the user problem this change solves.
- [ ] I can explain the important code without copying the AI's answer.
- [ ] I learned and used relevant English terms.
- [ ] I consulted the relevant documentation.
- [ ] I can predict at least one behavior or edge case.
- [ ] Tests/checks and their actual results are recorded.
- [ ] I have a short review note for later recall.

## AI assistant behavior
For this project, the assistant should:
- Work directly in GitHub when authorized, but explain the intent before or alongside changes.
- Prefer small pull requests and never merge without explicit owner approval.
- Not claim the learner understands a topic merely because code was generated.
- Ask the learner to reason through a small question before giving away every answer, while still offering direct help when blocked.
- Keep explanations beginner-friendly, bilingual where useful, and tied to the current code.
- Keep existing safety constraints: no direct commits to main, no secrets, no unapproved Firebase changes, no paid resources, and no unapproved deployment.

## Product delivery principle
Learning must not become endless theory. Each learning cycle should advance a real, testable part of AI Business Assistant. The first priority is to reconcile architecture proposals and agree on a small vertical slice before expanding implementation.
