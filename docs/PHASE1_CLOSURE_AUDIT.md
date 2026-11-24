# Phase 1 closure audit — AIBA (3A-367)

Closure batch, approved by the manager 2026-11-23 17:42 EET (8h estimate).
Audited against the three exit criteria of 3A-367, with live checks where
the criterion allows them. Verdict up front: **Phase 1 is not closable
yet — one criterion is unmet as written, one is partial, one is unmet.**
This document lists exactly what blocks closure, so nothing is hidden
behind a percentage.

## Criterion 1 — «جرد الشاشات U00–U42 منفذ بالكامل» — NOT MET

Two problems, one of them in the criterion itself:

1. **The register does not cover U25–U42.** The screens register (the
   owner-uploaded PDF, inventoried on 3A-371) covers **U00–U24 + rules
   G1–G7**. Screens U25–U42 do not exist in the register. The criterion
   as written asks for work that has no definition. The manager/owner
   must reconcile this: either the register extends to U42, or the
   criterion is corrected to U00–U24.
2. **Inside U00–U24, the work is not fully executed** (last inventory
   3A-371, 2026-11-22; nothing since has changed the register items
   except where noted):
   - Done (5): U01, U02, U05, U06, U24.
   - Partial with implementable remainder (7): U00, U03, U04, U07,
     U08, U09, U11. (The 3A-650 Part A fixes — overview KPI grid,
     assistant defer guard — repaired live review defects on these
     surfaces; they did not close the register's partial items.)
   - U10 (tax form, display only): implemented in 3A-371.
   - **U12–U23 (12 screens): no detailed owner requirements —
     «لسه ما اتحددش».** They cannot be executed until the owner
     defines them. Tracked as owner-reserved planning in 3A-408.
   - Rules: G6 done; G1/G2/G4/G5/G7 partial.

## Criterion 2 — «المراقبة الحية شغالة» — PARTIAL

- **Web Sentry: live.** DSN ships in `runtime-config.json`; test event
  AIBA-WEB-1 received 2026-11-22. The deployed web build (1.13.0)
  includes the Sentry integration.
- **UptimeRobot: live.** Monitor "AIBA API health" (id 804771958),
  5-minute interval on `/health`; Up at creation.
- **API Sentry: NOT activated.** The code merged in 3A-327 and shipped
  in 1.13.0, but `SENTRY_DSN` was never set on the Vercel API project
  (manager step, pending since 2026-11-22). No API event has been
  received. The API deploy alone does not activate it.

## Criterion 3 — «لا ديون مراجعة مفتوحة» — NOT MET

Round-2 review (3A-445) debts, status after the 1.13.0 release:

- Fixed and live: items 1 (API divergence — API now 1.13.0), 2
  (assistant defer guard), 3 (metric-grid CSS), 4 (API rate limiting),
  6 (report indexes), 7 (SW update flow).
- **Still open:** item 5 (Sentry API activation — manager step);
  item 8 (account/business deletion — launch-gate planning, 3A-650 §2);
  item 9 (RUM/Web Vitals — planning); item 10 partially (visual
  regression harness shipped; contract/mutation/fault-injection
  testing still planning).
- **3A-267 (CI failure notifications):** configuration verified sound,
  but delivery is **unproven** — the last 40 CI runs contain zero
  failures, so the notifier has legitimately skipped every time.
  Closing it needs a real failure notification or an authorized test
  post (manager's call).

## What blocks closure (complete list)

1. Owner decision: define U12–U23, or accept them out of Phase 1.
2. Criterion correction: U00–U42 → U00–U24 (or extend the register).
3. The 7 partial register screens (U00, U03, U04, U07, U08, U09, U11)
   and the partial rules G1/G2/G4/G5/G7 — one execution batch.
4. Manager step: set `SENTRY_DSN` on the Vercel API project + redeploy,
   then confirm an API test event.
5. Manager step: apply migration 0011 (needs production `DATABASE_URL`).
6. 3A-267: delivery proof (real failure or authorized test post).

## Addendum — 2026-11-23 ~18:05 EET (after the manager's SENTRY_DSN step)

- **API redeploy verified live:** after the manager set `SENTRY_DSN`
  and redeployed (deployment `c35zpd9f8`), `/version` still reports
  **1.13.0** / commit `b721905` / environment `production`;
  `/health` 200; `/readyz` 200 with `{"status":"ready"}`; `/docs`,
  `/openapi.json`, `/redoc` all 404 — **intended**, per the owner
  decision of 2026-11-22 (3A-364): `_interactive_docs_enabled()` in
  `backend/app/main.py` enables the docs routes only when `VERCEL_ENV`
  is empty or `development`. The 404 is the security fix working, not a
  problem.
- **Sentry API activation — test event sent:** a production-labelled
  test event ("3A-650 part B — production activation check (API)",
  id `a9b3e95e98dc4330bd2d4d20f857ef4b`) was sent through the aiba-api
  DSN and accepted. Final confirmation is a dashboard check the
  manager does: the event should appear under the aiba-api project's
  Issues in Sentry (it proves ingestion; the live deployment's own
  init runs the same code path when `SENTRY_DSN` is set).
- **Migration 0011 — release-time step built:** `DATABASE_URL` is a
  Vercel Sensitive (write-only) variable, so it cannot be applied from
  outside Vercel. PR #454 adds the repo side: a fail-closed
  build-time wrapper (`backend/scripts/apply_migrations.py`) plus
  `docs/RELEASE_MIGRATION.md` with the exact one-time dashboard
  change (prepend the script to the API project's Build Command),
  the exact 0011 SQL review, and the rollback plan. The dashboard
  change is the manager's step; the next deploy then applies 0011
  automatically.

## Addendum 2 — 2026-11-23 ~20:55 EET (migration applied; production at main head)

- **Migration 0011 APPLIED — blocker 5 resolved.** The manager set the
  API project's Build Command to run `python scripts/apply_migrations.py`
  (via the Vercel API) and redeployed production from main head
  `bb4553c` (deployment `d3i34s2zg`, Ready, promoted). The build log
  shows `Running upgrade 0010_stock_movement_idem ->
  0011_report_indexes`, then `0011_report_indexes (head)` and
  "database is at head" — migration 0010, also pending, applied in the
  same run. Every later deploy now applies pending migrations
  automatically at build time (fail-closed).
- **Why production had stayed at `b721905`:** GitHub-triggered
  deployments after merges #452–#455 were being cancelled seconds
  after starting; the manager's clean CLI deploy from a main checkout
  is what moved production. (The `/version` commit field reads
  "unknown" on this CLI deployment — no Git metadata; the deployed
  code is exactly main `bb4553c`, and the web's `sw.js` fingerprint
  confirms it: `aba-shell-v1.13.0-bb4553cb2894`.)
- **Re-verified live (~20:57 EET):** API `/version` 1.13.0 /
  production; `/health` 200; `/readyz` `{"status":"ready"}`; `/docs`
  404 (intended). Web `sw.js` at `bb4553c`.
- **Blocker 4 (Sentry API) — RESOLVED ~20:56 EET.** The dashboard
  sighting is confirmed: test event `a9b3e95e98dc4330bd2d4d20f857ef4b`
  is visible in the aiba-api project as the latest event of issue
  **AIBA-API-1** (https://3a-automation.sentry.io/issues/162992739/),
  timestamped 2026-11-23T16:05:03Z (18:05:03 EET), environment
  `production`, type RuntimeError — an exact ID match. (Grouping
  note: Sentry filed it under the same issue as the 3A-327 test event
  of 2026-11-22, environment `development`, which is why the issue's
  first-seen predates it and its environment tags read 50/50.) With
  blockers 4 and 5 resolved, **Part B is fully closed**; the audit's
  remaining blockers are 1 (U12–U23 owner definition), 2 (criterion
  correction), 3 (the 7 partial screens + partial rules batch) and 6
  (3A-267 delivery proof).

## Addendum 3 — 2026-11-24 ~03:00 EET (blocker 3 resolved — 3A-696 merged)

- **Blocker 3 (the 7 partial screens + partial rules batch) — RESOLVED.**
  Linear 3A-696, «تقدير: 10 ساعة», **«فعلي: 1 ساعة»** (most of the batch
  verified already-done by the verification pass before any code was
  written). Executed as three stacked PRs, candidate version **1.14.0**,
  merged by the independent QA/review line in order and verified by this
  chat via `gh pr view` (state + mergeCommit) before the issue was
  closed:
  - PR #457 (G1) — MERGED `29b47c6` — foldable filter panels: the
    `aba-filter-bar` `foldExtras` mode, invoices + stock-movement filters
    fold behind the filter button with an active-filter summary, and
    purchasing gains a filter bar (status + supplier).
  - PR #458 (U03/G5/G2) — MERGED `5f417c7` — products tools unified on
    the customers pattern; invoice-card amounts glued to their currency;
    the three export buttons and the six purchasing primaries gain icons.
    U04 export closed by evidence with no change (the 40px trim is the
    register's «تصغير», already applied).
  - PR #459 (G7) — MERGED `9157d37` — list scroll save/restore for
    purchasing and products, copied from the customer workspace (T18
    Slice U02); invoices need no change (drawer over a never-unmounted
    list).
- **Verified already-done by the 3A-696 verification pass (no code
  touched):** U04 compact table + title, U08 detail reorganisation +
  localised activity, U09 warnings separation, G4 skeletons everywhere,
  G5 in purchasing, U07 email wrap, U11 form widths, G7 for invoices.
- **Final evidence:** frontend unit suite **790/790**; production build
  Initial total **689.31 kB** (under the ≤690 kB line); no backend
  changes in the batch. Main head after the chain: `9157d37`.
- **What still blocks Phase 1 closure:** blocker 1 (U12–U23 owner
  definition), blocker 2 (criterion correction — follows the owner's
  U12–U23 decision), blocker 6 (3A-267 delivery proof — manager's call),
  plus the criterion-3 residuals already classified as Phase 2 planning
  (account/business deletion, RUM/Web Vitals, contract/mutation/fault
  injection). G3 font embedding stays blocked on owner-supplied font
  files (3A-416). **Phase 1 is still NOT closable.**

## Addendum 4 — 2026-11-24 ~04:48 EET (blocker 6 resolved — 3A-267 closed Done)

- **Blocker 6 (3A-267 delivery proof) — RESOLVED.** The CI failure
  notifier now provably delivers to Slack. Three enablers landed: a
  Slack app «3A CI Alerts» (bot scope `chat:write` only) installed on
  the 3A Automation workspace and a member of **#ci-alerts**
  (`C0CLH2M4MAQ`); the `SLACK_BOT_TOKEN` repository secret set; and PR
  #462 (merged `8848ddf`) pointing `SLACK_CHANNEL_ID` at the real
  channel in the workflow and the script fallback.
- **Proof:** controlled failure PR #463 (one intentionally failing
  frontend spec; closed unmerged, branch deleted) failed CI run
  45311294333; notifier run 45311364833 completed success («Slack
  failure notification delivered.»); the alert from the bot is in
  #ci-alerts at 2026-11-24 04:18:24 EET (message TS 1795486704.759459).
  **QA independently verified the arrival and closed 3A-267 Done**
  (completedAt 2026-11-24T02:47:34Z). Full record: TASKS.md checkpoint
  (PR #464, merged `d29ae8a`) and the proof comment on 3A-267.
- **What still blocks Phase 1 closure — decisions only, no code:**
  blocker 1 (U12–U23 owner definition), blocker 2 (criterion
  correction — follows the owner's U12–U23 decision), and G3 font
  embedding (owner-supplied font files, 3A-416). The criterion-3
  residuals remain Phase 2 planning items. **Phase 1 is still NOT
  closable — but every remaining blocker now sits with the owner.**

## Live evidence gathered for this audit (2026-11-23 ~18:00 EET)

- API `/version` 1.13.0 / commit `b721905`; `/docs`, `/openapi.json`,
  `/redoc` all 404; `/health` 200; `/readyz` 200.
- Web `sw.js` `CACHE_NAME = 'aba-shell-v1.13.0-b721905132bc'`, 200, full
  security-header set live (CSP, DENY, nosniff, Referrer-Policy,
  Permissions-Policy, HSTS).
- CI: last 40 runs 38 success / 2 cancelled / 0 failures.

---

## تصحيح المعيار (مدير، 2026-11-24 ~09:21 EET)

شرط الخروج في 3A-367 اتصحح من «جرد الشاشات U00–U42 منفذ بالكامل» إلى **«U00–U24»** — الشاشات U25–U42 غير موجودة أصلًا في سجل اتفاقات المالك، فالمعيار القديم كان مستحيلًا حرفيًا. السجل الكامل = U00–U24: المعرفة بالتفصيل + U12–U23 باشتقاق من نمطها وقواعدها المشتركة (حكم المالك 2026-11-24 ~08:50). نتائج هذا التدقيق التاريخية (سطور 10–18، 67) بتفضل كما هي كسجل زمني؛ التصحيح ده هو المرجع من دلوقتي.

---

## Addendum 5 — تنفيذ U12–U23 مكتمل؛ العائق 1 محلول بالكامل (2026-11-24 ~10:25 EET)

قرار المدير 2026-11-24 ~09:47 فتح تنفيذ دفعات U12–U23 كدفعات إقفال فيز 1 الأخيرة. التلات دفعات اتنفذت واتدمجت بالترتيب عبر قسم QA المستقل، واتحقق من الدمج (state MERGED + mergeCommit) قبل إقفال أي بند:

- **الدفعة 1 — 3A-698، PR #466، merge `4189fc6`، مرشح 1.15.0:** U21 بوابة الدخول + U22 إنشاء الحساب — هوية بطاقة الدخول (الشخصية المعتمدة + عنوان التطبيق)، زر الديمو الثانوي، رسالة الخطأ تحت النموذج، تبديل الوضع بيمسح الخطأ القديم. صفر تغيير في منطق المصادقة.
- **الدفعة 2 — 3A-699، PR #467، merge `24779e7`، مرشح 1.16.0:** U12 بحث وفلاتر موحدة + قسيمة مرتب قراءة فقط (صفر تغيير حسابات مرتبات)، U16 لوحة فلاتر موحدة مع بقاء الإرسال للخادم + كل الـ36 إجراء والـ18 هدف، U14 هيكل تحميل جوه المحادثة.
- **الدفعة 3 — 3A-700، PR #468، merge `6b9a696`، مرشح 1.17.0:** U13 قائمة أعضاء مساحة العمل + حالات، U17/U18 هياكل تحميل، U20 إزالة ملخص التغيير الخام من سجل المنصة + فلاتر موحدة، U23 حارس إرسال مكرر. U19 اتحقق سليمًا بالكامل وما اتلمسش.
- **الأدلة:** اختبارات الواجهة 809/809 عند رأس السلسلة (794 + 15 جديدة عبر الدفعات التلاتة)؛ بناء الإنتاج ناجح (Initial total 689.97 kB — تحت خط 690 بهامش رفيع). main head = `6b9a696`.

**النتيجة:** شرط الخروج «جرد الشاشات U00–U24 منفذ بالكامل + المراقبة الحية شغالة + لا ديون مراجعة مفتوحة» — الجزء الأول منه (الجرد) مكتمل الآن؛ المراقبة الحية شغالة (Sentry API + Web + UptimeRobot، 3A-409)؛ وديون المراجعة المفتوحة المتبقية هي المتابعات المسجلة تحت، مش عائق إقفال. **فيز 1 مغلقة من ناحية التنفيذ؛ الإعلان وإصدار الإنتاج المجمع (1.15.0–1.17.0) قرار المدير.**

**متابعات مسجلة (مش عوائق إقفال):** (1) مفهوم «مقروء/غير مقروء» في U15 محتاج علم قراءة في نموذج البيانات ونقطة نهاية في الخادم — دفعة خادم لوحدها. (2) ملخص منظم (كود + بارامترات) لسجل المنصة U20 محتاج تغيير خادم عند منتجي الملخصات؛ العرض الخام اتشال من الواجهة كإجراء فوري. (3) القبول بحساب منصة فعلي (U20) وبحساب جديد فعليًا (U23) وجهاز فعلي وقارئ شاشة — لم يُشغَّل في أي دفعة.
