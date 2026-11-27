# Fixrunde Szenariotest

**Goal:** The planning engine answers the 56 scenarios of the scenario test without the code-side faults U2–U10, warns where a chain step has no well-fitting method (U1 a), and a separate, gated data proposal closes the catalogue gaps (U1 b).

**Input (binding):** `/mnt/project-files/fmt2/berichte/szenariotest/2026-11-27-szenariotest.md` (causes U1–U10), raw answers `rohergebnisse.json`, requests `szenarien.mts`, runner `run.mts` (same folder). **Spec:** `docs/superpowers/specs/2026-11-26-fmt2-w-raster-design.md`. **Base:** `origin/main` at 633e460. All file:line references below are from that commit.

**What the check of the report against the code showed (read first):**
- The largest part of U1 is not a missing method. In at least six of the 25 scenarios the chain was chosen from a *guessed* approach: `semantic.classifyScales` guesses „Kooperatives Lernen“ (zuordnung.ts:937) and `if (!wahl && ansatzList.length) wahl = waehleKette(…)` (zuordnung.ts:2304) turns the guess into the chain „Kooperatives Lernen“ without listing an assumption (s1-geschichte-karikatur, gs1-mathe-zerlegen-20, betrieb-kasse, s1-musik-songwriting). This is code (Task Q3).
- Several methods the report calls missing exist: `karikatur-bildanalyse`, `vier-stufen-methode`, `experiment` (alias „Schülerexperiment“), `bestimmungsuebung`, `godly-play`, `gestaltungsaufgabe-gruppen`, `klassenmusizieren`, `fallstudie`, `sokratisches-gespraech`. They are not found because the request uses another word (no alias), or lose because of their own facets. These are fixes to existing entries, not new methods (Task QD1, part B and C).
- 221 of 314 entries carry `fachbereich: uebergreifend`, only 6 carry `ungeeignetBeiStufe`. A code-side „prefer the subject“ therefore only moves the 93 subject-specific entries; suitability by stage is a data matter.
- Not verified in code, only seen in the answers: U6 „DaZ: in jeder Phase derselbe Satz“ and „Matrixwerte nichtssagend“. They are named in Q5 as small or out of scope.

## Global Constraints
- German in UI/data/docs/commits and in every message text; code comments English. Never use „Anforderung“, „Bedingung“ (for the situation), „Bedingungsraum“, „Ergänzende Merkmale“. „lernort“ only as accepted input alias.
- No change to `data/bausteine/*.json` and `data/vocab.json` in the code tasks Q1–Q6. Every such change goes through Task QD1 (proposal) and Task QD2 (independent gate, then applied). User-facing wording in `data/ketten.json` and `data/teilgruppen.json` goes the same way. `data/regeln.json` may change in a code task only where a task says so (one new built-in rule in Q3, one text fix in Q6); the rule count tests and the Systematik page follow.
- No LLM chooses a method. `ausgang.json` is never rewritten, `bekannt` is never loosened. A new quality case that waits for the data task carries `bekannt` with the reason „wartet auf QD2“ and loses it in QD2.
- Core is the single source: reading the text, choosing chain and methods, rule messages and readable names live in @fmt/core; REST and MCP call it. No second copy of a word list or a label.
- No silent relaxing (spec W5, line 72): a step no method can fill stays open and the answer says why. No warning without a basis (ledger, spec line 237): every new message names rule and basis.
- An assumed value never excludes, it only orders (spec line 172), and everything assumed stands under `pflichtangaben.angenommen` with a reason.
- Backwards compatible: existing valid requests keep working; an answer may gain fields. Row keys `step-N` of `thematischeTabelle` do not change (subgroup proposals refer to them by `stepKey`). `maschinenlesbar.schemaVersion` is raised when its shape changes.
- REST and MCP stay equal: every changed answer is asserted on both sides.
- TDD for code. `npm run build:data` before server/web tests. Core, server, web green; `npm run qualitaet:ausgang` without Verschlechterung; the variability checks in `qualitaet.test.ts` (häufigster Ablauf ≤ 15 %, sport starts ≥ 3) stay green.
- Push and merge on our own once reviewed and CI is green (Jan, 2026-11-27).

## Regression cases (shared by all tasks)
- New series `packages/fmt-core/test/qualitaet/faelle-reihe5.ts` (`REIHE5`), wired into `qualitaet.test.ts` like `REIHE4`, not part of `ausgang.json`. Case id = scenario id of `szenarien.mts`, text verbatim.
- `Qualitaetsfall` (faelle.ts:8) gets an optional `anfrage` (the structured fields of the scenario: zielart, zeitMin, gruppe, raum, bildungsstufe, fachbereich, ohneSchrift, nachweis …; `fach` of the scenario becomes `fachbereich`, because the core has no field `fach`). `pruefeFall` (pruefen.ts:51) passes `{ text, ...anfrage }`.
- New expectations in `erwartet`: `regelnNicht` (rule ids that must not appear), `hinweis` / `hinweisNicht` (pattern on `hinweise`), `ketteNicht`, `schwach` (step ids that must carry the new message of Q3), `thema` (expected topic from `extractSubjectAndTopic`).
- Everything only the server builds (table, Zusatzphasen, Entwurf, groups, MCP parity) is tested in a new `apps/server/test/szenariotest.test.ts` with the same scenario ids.
- The runner `run.mts` and `szenarien.mts` are copied to `scripts/szenariotest/` (no change to the requests) so Task Q7 can repeat the full run.

## Task Q1: Verlaufsplan ohne falsche Minuten, Prüfmeldungen in den Hinweisen
Causes U2, U7.

**Found in code.**
- U2: `extractScheduledPhases` writes `phaseLabel: "Wiederkehr (3× à 5 min)"` and `durationMin: single * count` for every Wiederkehr node (apps/server/src/routes/assistant.ts:210–227), also when the node carries `ausserhalbBudget`. The adapt path already marks it: `Wiederkehr in Folgestunden (…)` with `durationMin: 0` (packages/fmt-core/src/adaptScenario.ts:796–806). The core sets `ausserhalbBudget` for every plan up to 180 min (zuordnung.ts:1567, 1749–1757). The rule text says „Summe = … min“ for the table (apps/server/src/llm/briefings.ts:954).
- U7: `mitRegelmeldungen` fills `hinweise` only from rule messages (zuordnung.ts:1927–1957). Open steps reach the plan as `offenGruende` (zuordnung.ts:1714–1716, briefings.ts „offenGruende“) but not `hinweise`; validator messages stay in `pruefung.meldungen`. The R-04 text prints the state code (`Zielzustand ${s.ziel}`, validate.ts:416); R-08 at validate.ts:161.

**Must change.**
- One core function builds the row of a Wiederkehr node (label, minutes inside, minutes outside); assistant.ts and adaptScenario.ts both use it. With `ausserhalbBudget`: label „Wiederkehr in Folgestunden (3× à 5 min)“, `durationMin: 0`, new field `dauerAusserhalbMin`, `wiederkehr: true`. Without it (plans over 180 min): label and minutes as today.
- `thematischeTabelle`, `methodenDetails` (`dauerMinGeplant: 0` plus `dauerAusserhalbMin`), the Entwurf (Verlaufsplan row and the line under „Sicherung“), `llmBriefing` and `maschinenlesbar.thematicRows` show the same. ZEITKONSISTENZ names the sum of the lesson and says that „Wiederkehr in Folgestunden“ is not part of it.
- Core `zuordnen`: for a plan, `hinweise` gets (1) one sentence per open step from `offenGruende` („Der Schritt „Lösungsversuche“ ist offen: …“), first in the list, together with „Der Ablauf ist unvollständig.“ when `pruefung.gueltig` is false; (2) every validator message of `pruefung.meldungen` that `judge` does not treat as by design (zuordnung.ts:1464–1471 lists them: R-04 at `/ablauf` is replaced by (1), R-05, R-07, R-09 at `/kontext`) and that no rule message already says (R-06 comes as Passungsregel). Each with its rule code and the phase it speaks about.
- validate.ts:416 prints the label of the state (`label('lernzustand', …)`), not the code.

**Must not change.** Shape and content of `pruefung`; `offenGruende`; the arrangement; row keys; minutes of the core phases; plans over 180 min; a valid plan without validator message gets no new note.

**Acceptance.**
- gs1-deutsch-anlaute-ohneschrift, s1-mathe-pythagoras-gruppen, s2-chemie-fakten-20 (server test): sum of `durationMin` over all rows equals `pruefung.dauerMin` equals the stated time (45, 45, 20); the Wiederkehr row matches `^Wiederkehr in Folgestunden \(3× à \d+ min\)$`, has `durationMin: 0` and `dauerAusserhalbMin` equal to `pruefung.dauerAusserhalbMin`. Over all 56 scenarios: no table sums to more than the stated time. MCP `build_scenario_plan` equals REST.
- A 240-minute request with a consolidation step: the row keeps „Wiederkehr (…)“ and counts.
- hs-bwl-fallstudie-online: `hinweise[0]` says the plan is incomplete and names „Lösungsversuche“ and the reason „höchstens 35 Personen“; no text of the answer contains `loesungsversuche`. `/match` shows the same note.
- hs-vorlesung-statistik-250: `hinweise` contains „Mehr als 20 Minuten am Stück im passiven Modus“ with the phase.
- integrationskurs-a2-arzt: the language-level warning appears once, not twice.

## Task Q2: Freitext lesen, Thema und Pflichtangaben
Causes U3, U9.

**Found in code (packages/fmt-core/src/zuordnung.ts unless named).**
- (b) „Kurvendiskussion“ → Diskurs: `diskussion` without word boundary in `ANSATZ_RULES` (822). „Geschichte vom …“ → Fach Geschichte: thema.ts:17 matches `\bgeschichte\b` before Religion (thema.ts:23), and the plan prefers that guess over the core's detector (`const fach = args.fach || extracted.fach || fachErkannt?.label`, briefings.ts:755); the core itself reads `fachbereich = gesellschaft [religion]` correctly. „Rollstuhl“ → subgroup: bare word in differentiationMatrix.ts:615 and adaptScenario.ts:508. „prüfen“ / „brauche was für morgen“ → Diagnose: semantic guess of a learning function at score ≥ 0.65 (949).
- (c) No time rule for „Projekttag“ (581–589).
- (d) „Biologie-Fachraum“: the room rule wants `bio(logie)?fachraum` without hyphen (701–703); a bare „Fachraum“ list item is not read (714–717).
- (a) Goal not read: „Songwriting“ is not in the gestalten rule (775), „Rückenfit / Kräftigung“ not in the kondition rule (769), „Mikroskopieren“ and „Titration“ are read as zielart `bewegung` (787); „Bäume … bestimmen“ needs the two words side by side (rule at 790); „Schülerversuch“ is in no rule (forschend rule 811–814 knows `experiment\w*` only); „schriftlicher Test“ gives no `nachweis` (734–741); „Prüfungsvorbereitung“ and Berufsschule + Werkstatt without „Lernfeld“ give no goal (`HANDLUNG_WORTE`, 843).
- (e) Subject area not read for Soziologie, Excel, Rückenfit, Alphabetisierung (673–679, `THEMEN_FACHBEREICH` 833); then `fach-und-thema` is reported missing although a topic is there (situation.ts:88).
- (f) Topic damaged: every subject word is cut anywhere in the text (thema.ts:40, 62), a full stop after an ordinal splits the topic (`\.\s`, thema.ts:109), room words stay (no entry in `WHOLE_PART_FRAME`, thema.ts:68).
- U9: a guessed learning function fills the gap `ziel` (situation.ts:87; the guess is listed by `zielVermutet`, 2236–2246, but `ziel` is no longer in `fehlt`). The subject guessed from a topic word („Klimawandel“ → Geografie, thema.ts:19) appears as `fach` without an assumption. Single-phase answers carry no `pflichtangaben` in `/plan` (briefings.ts:726–741).

**Must change.**
- Word rules: `\bdiskussion` with word boundary and not inside a compound of another subject („Kurvendiskussion“); „Geschichte vom/von/über/zu …“ is a story, not the subject; a subgroup from „Rollstuhl“ only where the text speaks of learners („im Rollstuhl“, „Rollstuhlfahrer“, „Kind mit Rollstuhl“), not of an object („in den Rollstuhl“).
- Room: hyphenated and bare forms („Biologie-Fachraum“, „…, Fachraum, …“, „Physik-Raum“).
- Goal words, each with its `beleg`: Songwriting/komponieren → gestalten; Rückenfit, Rückenschule, Kräftigung, Funktionsgymnastik → kondition and subject area sport; „… bestimmen“ with words in between → prozeduren; Schülerversuch, Versuchsreihe, Versuchsprotokoll → Ansatz forschend; „schriftlicher Test / schriftliche Arbeit / Klassenarbeit schreiben“ → `nachweis: schriftlich`; Prüfungsvorbereitung, Klausurvorbereitung → learning function Konsolidierung (leads to the practice chain, zuordnung.ts:2275–2286); Excel, Tabellenkalkulation → mathe-informatik and prozeduren; Soziologie, Psychologie, Pädagogik → gesellschaft; Statistik stays.
- Practical work outside sport: „Mikroskopieren“, „Titration“ and the like keep the chain but are named „praktische Fertigkeit“ in every text (see Q6 for the labels); no change of chain in this task.
- Berufsbildung with a stated practical room (werkraum, lehrkueche, fachraum) and no other goal: zielart `handlung` assumed and listed under `angenommen`.
- „Projekttag“ / „Studientag“: no time is read; the assumed time is 270 min (six lessons) instead of 45, with the reason „Projekttag: sechs Unterrichtsstunden angenommen.“ and `zeit` stays in `fehlt`.
- A graded test as the lesson („Test mit Note“, „Klassenarbeit“ with `bewertet` and no other learning verb): the check step gets the main share of the time (today a fixed `zeitanteil: 20`, 1410) and a written form of proof.
- A semantic guess of the learning function is not taken from a text without subject, stage and topic words („Ich brauche was für morgen“), and never from a single verb that has an everyday meaning („prüfen“ with an object). Where it is taken, `ziel` stays in `fehlt` and the guess stands under `angenommen` (same treatment as the assumed room).
- Subject: the plan takes the subject from the core's detector first, the topic guess of thema.ts last; a subject only guessed from a topic word is listed under `angenommen` (feld `fach`).
- `fach-und-thema`: when the topic is there but no subject is recognised, the answer keeps `fach-und-thema` in `fehlt` and adds under `angenommen`: „Fach nicht erkannt: ohne Fachbezug geplant.“
- Topic: cut only the subject word that was read as the subject (start of the text or its own comma part); keep „1. Lehrjahr“, „1. Semester“; drop a comma part that is only a room word the room rules read.
- Single-phase answers of `/plan` and `build_scenario_plan` carry `pflichtangaben` like `/match`.

**Must not change.** Every existing reading test and quality case; „Geschichte Klasse 9, Weimarer Republik“ stays Geschichte; „Diskussion: Darf man lügen?“ stays Diskurs; „3 Kinder im Rollstuhl“ stays a subgroup; explicit fields beat the text; a guessed value never excludes.

**Acceptance (REIHE5 unless marked).**
- gs2-religion-samariter: `fach` Religion, topic contains „Geschichte vom barmherzigen Samariter“ (server test for `fach`).
- s2-mathe-kurvendiskussion: `nichtKriterien: { ansatz: ['diskurs'] }`. s2-philo-kant-urteil, vage-morgen: no `lernfunktion` read.
- bs-pflege-transfer: no subgroup (server: no group `motorik`, no Zusatzphase for it); topic contains „2. Lehrjahr“.
- s1-bio-mikroskop-90: `kriterien: { raum: 'fachraum-nawi' }`, `raum` not in `fehlt`.
- s1-musik-songwriting-tablets: kette `produktion`. verein-rueckenfit-60: kette `kondition-training`, subject area sport. vhs-excel-4: `fachbereich: mathe-informatik`, kette `prozedur`. bs-wirtschaft-pruefungsvorb: kette `prozedur`. bs-kfz-bremsen: kette `vollstaendige-handlung`, `angenommen` contains zielart. gs3-sachunterricht-draussen: zielart prozeduren.
- s1-mathe-bruch-test: `kriterien: { nachweis: 'schriftlich', bewertet: true }`, the check step holds at least half of the time and uses a written check.
- s2-geschichte-projekttag: `angenommen` zeit = 270, `fehlt` contains zeit.
- s2-chemie-fakten-20: topic „funktionelle Gruppen der organischen Chemie auswendig können“. hs-labor-titration: topic contains „1. Semester“. hs-vorlesung-statistik-250, gs1-mathe-zerlegen-20: topic without „Hörsaal“ / „Klassenraum“.
- hs-seminar-soziologie-12: `fach-und-thema` not in `fehlt`. vhs-alpha-einkaufen: `fehlt` has it and `angenommen` says why.
- vage-klimawandel, betrieb-kasse-unterweisung: `ziel` in `fehlt`; Geografie under `angenommen`.
- gs4-englisch-wortschatz-10, s1-franz-vokabeln-10 (server): `pflichtangaben` present.
- s1-chemie-verbrennung: Ansatz forschend read. That the plan then holds an experiment needs the alias of QD1 (`bekannt` until QD2).

## Task Q3: Passende Methoden bevorzugen, schwache Besetzung melden
Cause U1, code part (a).

**Found in code.**
- Chain from a guess: zuordnung.ts:937 and 2304 (see above). `currentGuessedAnsatz` already marks the guess (2177) and is used for the soft score only (1178–1179).
- Stale assumption: when a named method does not fit the first chain, the plan retries another chain (2361–2390), but `pflichtangaben` still lists the first assumption (2416–2421). bs-einzelhandel-reklamation says „Konzepte angenommen“ and plans „Produktion“.
- Subject: a method of another subject costs soft +3, a method of the lesson's subject gains −0.5 (ranking.ts `SOFT_WEIGHTS.fachbereichFremd`, `fachbereichPasst`; set in zuordnung.ts:1185–1191). −0.5 is below the equivalence tolerance 0.75 (ranking.ts `EQUIVALENCE_TOLERANCE`), so the subject never decides among near-equal methods. „Other subject last“ exists only for bound steps (`fremd`, 1641–1646; order 1671–1689).
- Opening step: `sitzendImRaum` is a hard tier (1353–1358) and beats the subject. A room „im Betrieb“ counts as class `draussen` (situation.ts:34), so every seated opener loses to a movement method: „Bodypercussion“ opens the till training.
- No threshold: the first candidate the validator accepts is taken (1690–1712), also from `fallbackCands` (1621–1632) or with hard tiers above zero. Only a step with no candidate at all stays open (1713–1717).
- Proof: `nachweisRegelmeldung` looks at the check step only (regeln.ts:313–324; zuordnung.ts:1945–1947). A chain without a check step (Urteilsbildung) gives no message when the stated form of proof is not met (s1-politik-wahlalter-urteil).

**Definition „passt gut“ (from the existing ranking, nothing new is measured).** A chosen method fits its step well when all of this holds: it comes from the primary candidates and reaches the step's state (`reaches`, zuordnung.ts:1330–1333; not from `fallbackCands` or `ersatzFach`); it carries no fit warning that sets back (hard tier at 1160; includes Eignung for subject, stage, prior knowledge); it is not of another subject (`fremd`, 1641); `domainPenalty` is 0 (1072–1103); no room need is uncovered by an assumed room (1167); its minimum time fits the step (`hardCap` tier, 1169). Otherwise the step is „schwach besetzt“.

**Must change.**
- A guessed approach never chooses the chain. Without a stated or text-read goal the plan assumes „Konzepte“ (or the subject assumptions already in place) and lists it under `angenommen`. A named approach („kooperatives Lernen“, „Gruppenpuzzle“, „Stationen“) chooses as today.
- After a change of chain, `pflichtangaben.angenommen` names the goal kind of the chain that is planned, with the reason of the change.
- Subject first, in every step that has a subject: methods of another subject (own subject list, no `uebergreifend`, lesson's subject missing) come after all others, also in opening and closing steps and before the room tier of the opening. In main steps `fachbereichPasst` decides among near-equal methods (weight above the tolerance, or the `vorn` mark of `pickOrder`).
- An out-of-school room does not make openers stand up: the `sitzendImRaum` tier applies to rooms that offer `bewegungsflaeche` only.
- New built-in rule `schritt-schwach-besetzt` in `data/regeln.json` (wirkung `weist-hin`, grundlage `S`, text: „Für „{schritt}“ fand sich keine gut passende Methode. {methode} steht dort als Notlösung: {grund}. Prüfe den Schritt oder nenne eine Methode.“). One message per weakly filled step, with step, method and the first failed point as reason; it goes to `regelmeldungen` and `hinweise` like the others. New result field `schwachBesetzt: [{ schritt, baustein, grund }]`, passed through by `/plan`, `/match` and both MCP tools.
- A stated form of proof that no method of the plan yields gives `nachweis-passt-zum-ziel` also when the chain has no check step.

**Must not change.** No step that is filled today becomes open; no method is excluded by the new tier (it orders only); a method the teacher named keeps its place (`genannter-wunsch-bleibt`); the binding of the knowledge type; the stand-in for psychomotorik (`ersatzFach`, 1648–1668) and its sentence in `annahmen`; sport plans; variability checks.

**Risk.** The subject tier touches every plan with a subject. Expect changed methods in many quality cases; `qualitaet:ausgang` decides. If a case gets worse, the tier is narrowed (main steps only) before any expectation is touched. The message will be frequent while the catalogue has gaps; that is intended and is the worklist for QD1.

**Acceptance.**
- s1-geschichte-karikatur, gs1-mathe-zerlegen-20 (with `modus: ablauf`), s1-musik-songwriting-tablets: `ketteNicht: 'kooperatives-lernen'`; `angenommen` lists the goal kind.
- betrieb-kasse-unterweisung (with `modus: ablauf`): `nicht: ['gebundene-musik-rhythmus']`; every method of another subject in the plan is named by a `schritt-schwach-besetzt` message.
- bs-einzelhandel-reklamation: `angenommen` names „Gestalten und Produzieren“, not „Konzepte“.
- s1-politik-wahlalter-urteil: `regeln: ['nachweis-passt-zum-ziel']` unless a method of the plan yields „mündlich“.
- Unit test with a small catalogue: a step whose only candidates are of another subject is filled and carries the message; a step with a fitting method carries none.
- Existing: „Gruppenpuzzle …“ and „kooperatives Lernen Doppelstunde“ still plan `kooperatives-lernen`; n01–n20 unchanged.
- Count over the 56 scenarios (report in the PR): steps with the message before and after QD2.

## Task Q4: Hinweise nur mit Anlass
Causes U4, U5.

**Found in code.**
- U4: `sicherheitsRegelmeldung` fires when the room class is fachraum, bewegungsraum or draussen **or** the subject area is nawi-technik, beruf-praxis or sport, and any chosen method has `repraesentation: enaktiv` (regeln.ts:251–252, 294–310). It names the first three such methods in plan order. 82 entries are `enaktiv`; 55 of them neither carry `psychomotorik` nor need `fachausstattung`, `bewegungsflaeche` or `aussenort` (Positionslinie, Klassenspaziergang, Rollenspiel, Buddy Book, Darstellungswechsel …). The source is always the rule's `quelle` „KMK 2023 (RiSU)“ (data/regeln.json). `betreuungshinweis` exists as a field (types.ts:393) and no entry carries it. Called at zuordnung.ts:1943 and regeln.ts:374.
- U5 groups: without named groups the plan builds three default groups (briefings.ts:758–785) and derives Zusatzphasen and subgroup methods from them (briefings.ts:865–866). The Entwurf already leaves default groups out (briefings.ts:906–907).
- U5 rule: `lageRegelmeldungen` reports a fit rule as soon as any catalogue method fires in the situation (regeln.ts:273–290; called at zuordnung.ts:1944), so every primary-school plan gets „Problemlösen vor Instruktion in der Grundschule“.

**Must change — Sicherheitshinweis (minimal rule).** Two notions, both from coded fields:
- *Praktisch im engeren Sinn:* the method carries the knowledge type `psychomotorik` or needs `fachausstattung`, `bewegungsflaeche` or `aussenort`.
- *Raum mit Sicherheitsbezug:* room type fachraum-nawi, werkraum, lehrkueche, fachraum, bewegungsraum, draussen, ausserschulisch (stated or assumed). Not musikraum, computerraum, klassenraum, hoersaal, digital.
- The note appears when (1) the room has Sicherheitsbezug and a chosen method is `enaktiv`, or (2) no room is stated and a chosen method is praktisch im engeren Sinn. The subject area alone no longer triggers it.
- It names methods that are praktisch im engeren Sinn first. If the plan has none, the sentence names the room instead of a method („Der Ablauf findet im Fachraum statt. Kläre vorher Sicherheit und Aufsicht.“).
- The source „KMK 2023 (RiSU)“ is shown only for fachraum-nawi, werkraum, lehrkueche and fachraum; in sport, outside and out of school the note carries no source. A fitting source for sport is a data decision for the gate (QD1, part D).
- A method's `betreuungshinweis`, where an entry has one, is appended to the note (texts come with QD1).

**Risk (Sicherheitshinweis).** Checked against the 56 answers: the note goes away in bs-einzelhandel, bs-wirtschaft, bs-it and gs4-musik and stays in all sport, lab, workshop, kitchen and art scenarios. Three points need a ruling before coding: (a) fixwelle-b.test.ts:29–34 asserts the old behaviour („Einstieg Chemie Klasse 8 Säuren“ lists `soziometrie-aufstellung` as hands-on); under the new rule this request gets no note. The test is rewritten on purpose, not adapted in passing. (b) Trigger (2) depends on `raumbedarf`, which is incomplete: `demonstrationsexperiment` and `gestaltungsaufgabe-gruppen` need no `fachausstattung` today. With a stated room this does not matter (trigger 1); without a room a chemistry demonstration would get no note until QD2 fixes the entries. A missed safety note is worse than a superfluous one, so until QD2 trigger (2) keeps one fallback: subject area nawi-technik and a method that is `enaktiv` and names nawi-technik in its `fachbereich`. (c) Bodypercussion in the music room loses the note; if Jan wants it for instruments, musikraum goes back into the list.

**Must change — Standardgruppen.** With the default groups (`activeGroups === defaultGroups`) `zusatzphasen` and `teilgruppenMethoden` are empty, unless the text itself names a trait of the class without a number (`detectedTraits.signals`, briefings.ts:757–781); then only the group that carries the trait counts. `lerngruppenUndMatrix` keeps the three groups and marks each with `standard: true`. `/adapt` is unchanged (it is asked for differentiation and says `gruppenQuelle`).

**Risk (Standardgruppen).** The Baukasten shows the same three default groups as visible cards and derives the same proposals (apps/web/src/pages/PlannerPage.tsx:590, 620; scenarioModel.ts:192–215). After this task API and Baukasten differ for requests without groups. Minimal here means: API only. Whether the Baukasten follows (default groups shown but inactive) is a ruling for the ledger; the parity test „Plan-API und Baukasten schlagen für dieselben Teilgruppen dasselbe vor“ uses named groups and stays green.

**Must change — Lage-Regel.** A fit rule without a method is reported only when it moved the plan: at some step the method that would stand first without the warning tier carries this rule's warning. In a single phase nothing changes (warnings stand at each proposal).

**Must not change.** One note per answer; `bausteine` lists all methods the note speaks about; `regelmeldungenNeuPruefen` gives the same result as the first answer; n20 keeps its message; named and passed groups keep Zusatzphasen and subgroup methods exactly as today.

**Acceptance.**
- `regelnNicht: ['sicherheitshinweis']`: bs-einzelhandel-reklamation, bs-wirtschaft-pruefungsvorb, bs-it-netzwerk-ohneinternet, gs4-musik-bodypercussion.
- `regeln: ['sicherheitshinweis']`: gs2-sport-werfen, s1-sport-ausdauer-draussen, s1-sport-bodenturnen-90, luecke-sport-ohne-raum, s1-bio-mikroskop-90, s1-physik-stromkreis-problem, s1-kunst-linolschnitt, gs3-kunst-drucken-90, bs-kfz-bremsen, bs-gastro-saucen, hs-labor-titration, and „Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten“ (core.test.ts:843).
- Wording: s1-kunst-linolschnitt, bs-gastro-saucen, hs-labor-titration never name Positionslinie or Klassenspaziergang; bs-pflege-transfer and s1-chemie-verbrennung name the room when no practical method is planned; no sport answer contains „RiSU“.
- Server: s1-ethik-luegen-diskussion, gs2-sport-werfen, hs-seminar-soziologie-12 have `zusatzphasen: []`; gs4-mathe-teilgruppen and the text of abschlussaudit.test.ts:22 keep theirs; „Mathe Klasse 7, viele DaZ-Kinder, 45 Minuten“ keeps a proposal for the language group.
- `regelnNicht: ['problemloesen-vor-instruktion-primar']`: gs2-sport-werfen, gs3-kunst-drucken-90, gs4-musik-bodypercussion. A primary-school request whose first choice would be such a method (found with the rule count report) keeps the message. lage-meldungen.test.ts green.

## Task Q5: Teilgruppen gleich behandeln
Cause U6. Depends on Q4 (default groups must be out before persona values count).

**Found in code.**
- Only named values decide; persona values only order the matrix (methodAdjustments.ts:114–134, teilgruppen.ts:183–187). A group passed with `personaId` alone has no named value and ends at „passt“ (teilgruppen.ts:265). The quick profiles hold the named core of each persona (`kern`, adaptScenario.ts:104–110, 118 ff., e.g. `foerder-lernen` → `foerderbedarf-lernen-umfassend`); the text path uses them, the field path does not.
- `ohneSchrift: ['lesen']` leads to a swap only when the planned method needs reading (teilgruppen.ts:139–153). In s1-deutsch-sachtext-gruppen the planned methods carry no `liest` (Lautes Denken, Kurztransfer, Verschachteltes Üben), although the lesson is about reading a text.

**Must change.**
- A group the caller passes with `personaId` and without own values is read like the quick profile of that persona: its `selectedValues`, with `kern` as the named values. The same group from free text and from the field gets the same answers.
- A group that cannot read, in a lesson whose topic is work on a text (subject area sprachen or a text word in the topic; one shared helper with the text-domain check at zuordnung.ts:1076–1081): every phase without `liest` answers `hilfe` with the trait „kann nicht lesen“ and the reason that the lesson, not the method, asks for reading. The help text („Leseentlastung: vorlesen lassen, Hörfassung, vereinfachter Text“) is a new row of `data/teilgruppen.json` and comes through the gate (QD1, part D); until then the case carries `bekannt`.
- The Entwurf states a help that is the same in every phase once per group („gilt für alle Phasen“); the structured answer stays per phase.

**Must not change.** Blocked categories; „erst Hilfe, dann Tausch“; a persona never adds a blocked category; groups with own `selectedValues` or `genannt`; the default groups get no answers (Q4); the matrix scores. Out of scope: the wording of small matrix profiles („Akustische und visuelle Rahmenbedingungen (+4)“).

**Acceptance.**
- Core test: `{ personaId: 'highPerforming' }` and the text group „4 leistungsstarke“ get the same answer per phase for the plan of s1-mathe-pythagoras-gruppen; at least one phase is not „passt“ where the method only guides closely.
- gs4-mathe-teilgruppen, s1-mathe-pythagoras-gruppen (`/adapt` and `adapt_scenario`): the group „Förderbedarf Lernen“ has at least one `hilfe` or `tausch` with the row „lernschwierigkeiten“; REST equals MCP.
- s1-deutsch-sachtext-gruppen: the reading group gets `hilfe` with „kann nicht lesen“ in every phase (`bekannt` until QD2 for the text).
- teilgruppen.test.ts, teilgruppen-daten.test.ts, n07–n12 unchanged.

## Task Q6: Wortlaut und gleiche Antwort von /plan und /match
Causes U8, U10.

**Found in code.**
- „Phase N“: fallback when a top-level method has no chain step (assistant.ts:190–194; adaptScenario.ts:788). Added steps carry none on purpose (zuordnung.ts:1700); the core knows their labels („Leistung oder Lernstand überprüfen“, 1407; „Zusatzphase (im Text genannt)“, 1810) but only in `schritte`.
- „Hauptziel“ = chain label: `hauptziel: body.lernziele?.trim() || chain?.label` (briefings.ts:191).
- Lesart: `lesart()` (zielart.ts:32) is used by the web only; `schritte[].ziel` and `pruefung.endzustand` print the plain label (zuordnung.ts:1733, 1869).
- Chain wording outside sport: steps b1 and b4 of `fertigkeit-bewegung` (data/ketten.json) and the label „Motorische Fertigkeiten“ (data/vocab.json:703).
- Sentence: „Erarbeiten {Fach} – {Thema} mittels {Methode}: …“ (assistant.ts:313).
- Proof: the reason names the goal kind of the chain (zuordnung.ts:557–573) while `angenommen` names another one; fixed by Q3 for the assumption, the sentence itself needs „aus der angenommenen Zielart“ when the goal kind was assumed.
- Pronoun: „{methode} hast du genannt. Sie bleibt …“ (data/regeln.json, `genannter-wunsch-bleibt`).
- U10: `/plan` sets `modus: 'ablauf'` for every request (briefings.ts:696); `/match` lets the core decide (zuordnung.ts:2182–2204): a plan needs a goal, or a stated time of at least 40 minutes without a phase word (2186). „Einstieg in lineare Funktionen, 45 Minuten“ counts as a phase because „Einstieg“ is a phase word; 20 minutes with subject and stage count as a phase.

**Must change.**
- A top-level method without chain step gets the label of its step from the core answer (`schritte`, passed as `phasen`); where an arrangement comes alone (import, `/elaborate`), the fallback is the label of the method's first learning function („Diagnose“, „Erwerb“), never „Phase N“.
- „Hauptziel“: the stated `lernziele`; otherwise a sentence from goal kind and topic („Verfahren sicher anwenden: {Thema}“, wording per goal kind in the core next to the Lesarten); the chain is named in its own line „Ablaufmuster“.
- REST and MCP print learning states in the Lesart of the plan's goal kind (`schritte[].ziel`, `pruefung.endzustand`, `match.schritte`).
- The core reads an optional step label per Lesart from `data/ketten.json` (`labelJeLesart`); the wording for practical work outside sport and the label of the knowledge type come through the gate (QD1, part D). Tested with a fixture until then.
- The automatic sentence of the table: „{Thema}: {erster Schritt der Methode}“, without „Erarbeiten … mittels“ and without repeating the method name.
- `genannter-wunsch-bleibt`: „Die Methode bleibt im Ablauf …“ (text in data/regeln.json; no other change of the rule).
- Modus, one rule in the core, used by both: (1) a stated time of at least 20 minutes together with subject or stage and without a request for one phase is a plan (today 40); (2) „Einstieg in / Einführung in {Thema}“ with a lesson time is the topic of a lesson, not a phase; (3) where `/plan` still plans although the core would offer one phase (no frame at all: vage-morgen, vage-klimawandel), `/plan` says so in `hinweise` („Kein Rahmen für einen Ablauf genannt; der Ablauf steht auf Annahmen.“) and `/match` says in `hinweise` that `modus: ablauf` gives a plan. `/plan` keeps its contract to plan.

**Ruling needed (ledger).** (3) keeps a visible difference for requests without any frame. The alternative, `/plan` answering with single-phase proposals there, changes the contract of `build_scenario_plan`; not proposed.

**Must not change.** Chain ids and step ids; „10 Minuten“ stays a single phase with its message; a request with a phase word and no lesson time („Einstieg Chemie Klasse 8 Säuren“) stays a phase; the Entwurf's seven core fields; the web's own use of `lesart()`.

**Acceptance.**
- Server: s1-mathe-bruch-test, bs-it-netzwerk-ohneinternet, hs-vorlesung-statistik-250: no row label matches `^Phase \d+$`; over all 56 none.
- s1-englisch-rollenspiel, bs-einzelhandel-reklamation: „Hauptziel“ is not a chain label; the proof sentence and `angenommen` name the same goal kind.
- gs2-sport-werfen, bs-gastro-saucen via REST and MCP: `schritte[].ziel` shows the Lesart (not „Prozedur geläufig“).
- s1-bio-mikroskop-90, hs-labor-titration (fixture): no label contains „Bewegungsvorstellung“ or „Spiel-“.
- s1-englisch-rollenspiel: no table text contains „mittels“.
- gs1-mathe-zerlegen-20, betrieb-kasse-unterweisung, s1-mathe-linfkt-einstieg: `/match` answers `modus: ablauf` with the same methods and order as `/plan`. vage-morgen, vage-klimawandel: both answers carry the note of (3).

## Task QD1: Datenvorschlag (no code)
Cause U1, data part (b), plus the wording the code tasks wait for. Output: `/mnt/project-files/fmt2/daten-entwurf/szenariotest/` with one JSON per new entry (status „entwurf“), one CSV of field changes to existing entries (kennung, feld, alt, neu, Szenario, Grund), and a short note per decision. Nothing goes into the repo in this task. Before writing an entry: check `name` and `alternativname` of all 314 entries again and the catalogue review `durchsicht-3-katalog-geprueft.csv`.

**A. New methods (checked against names and alternativname; none exists).** Facets are a first reading for the gate.

| Vorschlag | Kurz | Facetten (grob) | Szenarien | Abgrenzung zu Vorhandenem |
|---|---|---|---|---|
| Textgespräch (Interpretationsgespräch am Text) | Gemeinsames Deuten eines Textes mit Belegen am Wortlaut | sprachen, gesellschaft; verstehen, anwendung; konzepte, AFB II–III; liest; 6–35; 20–45 min; nicht primar | s2-deutsch-gedicht-90, hs-seminar-soziologie-12, s2-philo-kant-urteil | sokratisches-gespraech (ohne Textgrundlage, bis 24), lehrgespraech (lehrergelenkt), reziprokes-lesen (Lesestrategie) |
| Quelleninterpretation (Textquelle) | Beschreiben – einordnen – beurteilen einer historischen Quelle | gesellschaft; verstehen, anwendung; liest, schreibt; 20–45 min; ab sek1 | s1-geschichte-karikatur, s2-geschichte-projekttag | karikatur-bildanalyse (Bildquelle), quellenkritik-check (Web-Information) |
| Zeitzeugen- und Experteninterview | Fragen vorbereiten, Gespräch führen, auswerten | gesellschaft, sprachen, beruf-praxis; anwendung, problemloesen; r3; 45–180 min | s2-geschichte-projekttag | partnerinterview, drei-schritt-interview (Austausch unter Lernenden) |
| Handelndes Erarbeiten mit Material | Legen, Zerlegen, Ordnen am Platz vor jeder Schreibweise | mathe-informatik, nawi-technik; erwerb, verstehen; enaktiv; kein Schriftbedarf; 10–25 min; primar, sek1 | gs1-mathe-zerlegen-20, s1-informatik-unplugged | darstellungswechsel (verlangt Schreiben), drei-stufen-lektion (Begriffslektion) |
| Erkundung am Objekt | Beobachtungsauftrag am realen Gegenstand im Nahraum | nawi-technik, gesellschaft, aesthetik; erwerb, verstehen; enaktiv, ikonisch; aussenort; kein Schriftbedarf; 20–45 min | gs3-sachunterricht-draussen | exkursion (ganze Veranstaltung), bestimmungsuebung (Schlüssel, Schreiben), waldpaedagogik |
| Erzählkreis (Lehrererzählung mit Gespräch) | Erzählen im Kreis, danach gelenktes Gespräch | sprachen, gesellschaft; orientierung, erwerb, verstehen; kein Schriftbedarf; 10–25 min; primar | gs2-religion-samariter | storytelling, vorlesen-lesung, godly-play (35–55 min), redestabrunde. Gate: eigener Eintrag oder Alias zu storytelling |
| Individuelle Gestaltungsaufgabe (Werkstattphase) | Einzelarbeit am eigenen Werkstück, Lehrkraft berät | aesthetik; anwendung, problemloesen; psychomotorik, prozeduren; fachausstattung; 1–32; 30–90 min; Nachweis Produkt | s1-kunst-linolschnitt, s1-musik-songwriting-tablets | gestaltungsaufgabe-gruppen (nur Gruppen ab 6), praxisauftrag-arbeitsplatz |
| Musikalische Gestaltungsaufgabe (Komponieren, Arrangieren) | Eigenes Stück entwerfen, auch digital | aesthetik; anwendung, problemloesen; 30–90 min; Technik wahlweise einzeln | s1-musik-songwriting-tablets | klassenmusizieren (Reproduktion), podcast-produktion. Gate: eigener Eintrag oder Variante der Werkstattphase |
| Auftragsanalyse | Arbeitsauftrag lesen, Ziel, Material und Vorgaben klären | beruf-praxis; orientierung; liefert problem-erschlossen; 5–20 min | bs-pflege-transfer, bs-kfz-bremsen, bs-gastro-saucen | leittextmethode (ganze Handlung, ab 120 min) |
| Arbeitsplanung | Arbeitsschritte, Mittel, Zeit und Sicherheit festlegen | beruf-praxis; problemloesen; liefert loesungsversuche; schreibt; 10–30 min | bs-pflege-transfer, bs-gastro-saucen | provokationstechnik (Kreativtechnik) steht heute dort |
| Soll-Ist-Kontrolle mit Prüfliste | Arbeitsergebnis gegen Kriterien prüfen, selbst und durch andere | beruf-praxis, nawi-technik, aesthetik; diagnose; prozeduren, psychomotorik; 5–20 min; Nachweis praktisch | bs-pflege-transfer, bs-gastro-saucen | fall-simulation-osce (Prüfstation), kriteriales-rubric (Selbsteinschätzung) |
| Prüfungstraining mit Besprechung | Prüfungsaufgaben unter Zeit bearbeiten, dann besprechen | uebergreifend; konsolidierung, anwendung, diagnose; schreibt; 30–90 min | bs-wirtschaft-pruefungsvorb | klassenarbeit-summativ (die Prüfung selbst) |
| Geführte Software-Übung | Vormachen am Beamer, Mitmachen am eigenen Gerät | mathe-informatik, beruf-praxis; erwerb, anwendung; prozeduren; Technik einzeln; 1–30; 15–45 min | vhs-excel-4, bs-it-netzwerk-ohneinternet | pair-programming (zu zweit, Code), lernen-am-modell |
| Kräftigungsprogramm (Wiederholungsmethode) | Belastung in Sätzen mit Pausen, Haltungskontrolle | sport; liefert leistung-trainiert; psychomotorik; bewegungsflaeche; 15–30 min | verein-rueckenfit-60 | dauer-intervallmethode (Ausdauer), stationstraining-bewegung (Zirkel). Gate: Eintrag oder Alias |

Not proposed, because an entry exists: Bild- und Karikaturenanalyse (`karikatur-bildanalyse`), Vier-Stufen-Methode (`vier-stufen-methode`), Schülerexperiment (`experiment`), Arten bestimmen (`bestimmungsuebung`), Fallarbeit (`fallstudie`, `case-based-learning`), Sprechübungen im Anfangsunterricht (`zickzack-dialog`, `tandem-lernen`, `chorsprechen`), Klassenmusizieren. For the Schülerversuch nach Vorschrift (no hypothesis) the gate decides between an alias of `experiment` and an own entry.

**B. Fixes to existing entries (fachbereich, Eignung, Dauer, Zustände) — kept apart from A.**

| Eintrag | Änderung (Vorschlag) | Szenario |
|---|---|---|
| differenzielles-lernen | `fachbereich` ohne `aesthetik` (Bewegungsvariation, kein Gestalten) | s1-kunst-linolschnitt |
| positionslinie | `fachbereich` ohne `uebergreifend`; `enaktiv` prüfen | s1-kunst-linolschnitt, bs-pflege, bs-kfz, bs-gastro |
| enaktiv ohne Hantieren | Durchsicht der 55 Einträge mit `enaktiv`, aber ohne psychomotorik und ohne Raumbedarf über Stellfläche (u. a. klassenspaziergang, soziometrie-aufstellung, vier-ecken-methode, buddy-book, darstellungswechsel, rollenspiel) wie beim Tor zu stummer-impuls | U4 |
| demonstrationsexperiment, gestaltungsaufgabe-gruppen | `raumbedarf: fachausstattung` ergänzen | U4 (Auslöser ohne Raum) |
| praxisauftrag-arbeitsplatz | `dauerMax` 30 → 90 (füllt sonst keinen Hauptschritt) | hs-labor-titration, bs-gastro-saucen, bs-pflege-transfer |
| jenaplan-kreis | Reichweite r4 oder aus Stundenabläufen heraus (Tagesrhythmus, mind. 90 min) | hs-labor-titration |
| freiarbeit | prüfen: liefert `prozedur-gelaeufig`, mind. 90 min, steht als „Ausführen“ in der Lehrküche | bs-gastro-saucen |
| provokationstechnik | `loesungsversuche` prüfen oder `fachbereich` einengen | s1-physik-stromkreis, bs-pflege-transfer |
| swot-analyse | steht als Kontroverse; Eignung im Fachbereich gesellschaft für Urteilsbildung prüfen | s2-philo-kant-urteil, bs-wirtschaft |
| markt-der-moeglichkeiten, kwl-methode | Zustände prüfen (Kontroverse, Urteil begründen) | s1-politik-wahlalter-urteil |
| lautleseverfahren | `ungeeignetBeiStufe`: sek2, hochschule | s2-deutsch-gedicht-90 |
| deduktives-erlaeutern | `ungeeignetBeiStufe`: primar | gs1-deutsch-anlaute |
| pecha-kucha, feynman-methode | Eignung für Lernende ohne Schrift und für die Primarstufe prüfen | vhs-alpha-einkaufen |
| vokabeltest-kurzkontrolle | Name „Schriftliche Kurzkontrolle“ mit Alias „Vokabeltest“, oder `fachbereich: sprachen` | gs4-mathe-teilgruppen, vhs-excel-4 |
| elevator-pitch, spiral-wiederholung, karteikarten-leitner | als Wiederholung von Verfahren und in Einführungsstunden prüfen (`aufgabe`, `vorbedingung`) | s1-mathe-pythagoras, gs3-sachunterricht, s1-informatik-unplugged |
| bestimmungsuebung | Schreiben nicht zwingend; als Hauptschritt wählbar machen | gs3-sachunterricht-draussen |
| fallstudie, case-based-learning | `gruppeMax` für Arbeit in Teilräumen (heute 35 und 45) | hs-bwl-fallstudie-online |
| vier-stufen-methode | `fachbereich` prüfen (heute auch sport, aesthetik) | betrieb-kasse-unterweisung |
| Stufe allgemein | `ungeeignetBeiStufe` tragen 6 von 314 Einträgen: Durchsicht der Einträge mit `schriftbedarf` für den Anfangsunterricht und der Präsentationsformen für die Primarstufe | gs1-mathe-zerlegen-20, gs2-religion-samariter |

**C. Aliases (`alternativname`) so a named method is found.** experiment: „Schülerversuch“; karikatur-bildanalyse: „Karikatur“, „Bildquelle“, „Quellenarbeit mit Bildern“; vier-stufen-methode: „Unterweisung“, „betriebliche Unterweisung“; fallstudie: „Fallstudie“ in Zusammensetzungen („Marketing-Fallstudie“ — check the mention detector first, mentions.ts:41–63); sokratisches-gespraech or the new Textgespräch: „Textdiskussion“; storytelling or Erzählkreis: „Erzählkreis“. Each alias is checked for an everyday meaning (the mention filter at zuordnung.ts:2143–2163 drops synonyms that do not fit subject or room).

**D. Wording and rules the code tasks wait for.**
- `data/ketten.json`: `labelJeLesart` for `fertigkeit-bewegung` b1 and b4 outside sport („Einstimmen und Handgriff vor Augen führen“, „Anwenden an einer neuen Aufgabe“) (Q6).
- `data/vocab.json`: label of the knowledge type psychomotorik („Motorische Fertigkeiten“, line 703) for practical work (Q6).
- `data/teilgruppen.json`: help row for reading relief when the lesson's topic asks for reading (Q5).
- `betreuungshinweis` for the practical methods (experiment, demonstrationsexperiment, praxisauftrag-arbeitsplatz, methodische-uebungsreihe, vier-stufen-methode …): one sentence on the danger (Hilfestellung und Matten, Schutzbrille, Messer) (Q4).
- Source of the Sicherheitshinweis in sport (Q4).
- Optional rule „Schrift im Anfangsunterricht“: a method with `schriftbedarf` in Klasse 1 and 2 carries a warning. Needs the grade as a field of the situation (today only `bildungsstufe`); proposal for the gate, not part of Q1–Q6.

## Task QD2: Tor und Einspielen der Daten
- Independent gate over QD1 (a reviewer who did not write the proposal), record under `/mnt/project-files/fmt2/pruefung/tor-szenariotest.md` with every deviation and reason; the cautious reading wins (no need and no warning without a basis).
- After the gate (Jan delegated the gate to an independent reviewer): apply to `data/bausteine`, `data/vocab.json`, `data/ketten.json`, `data/teilgruppen.json`; new entries with status „entwurf“; `npm run build:data`; counts in README, Systematik page and tests follow.
- Remove `bekannt: 'wartet auf QD2'` from the REIHE5 cases that now pass: s1-chemie-verbrennung (`enthaelt: 'experiment'`), s1-kunst-linolschnitt (`nicht: ['differenzielles-lernen']`), hs-labor-titration (`nicht: ['jenaplan-kreis']`), s2-deutsch-gedicht-90 (`nicht: ['lautleseverfahren']`), s1-geschichte-karikatur (`enthaelt: 'karikatur-bildanalyse'`), betrieb-kasse-unterweisung (`enthaelt: 'vier-stufen-methode'`), s1-deutsch-sachtext-gruppen (reading relief). A case that still fails keeps `bekannt` with the real reason.
- Remove the fallback of Q4 trigger (2) once the `raumbedarf` fixes are in.
- `npm run qualitaet:ausgang` without Verschlechterung; count of `schritt-schwach-besetzt` over the 56 scenarios before and after.

## Task Q7: Abschluss
- Repeat the full scenario run (`scripts/szenariotest/run.mts`, REST and the five MCP comparisons) and write `/mnt/project-files/fmt2/berichte/szenariotest/2026-11-xx-nachlauf.md`: per cause U1–U10 the scenarios before and after, and what stays open.
- Final whole-branch review, one fix wave, full tests, `qualitaet:ausgang`, PR, CI, merge.

## Order and dependencies

| Schritt | Task | Hängt ab von | Dateien (Schwerpunkt) |
|---|---|---|---|
| 0 | Regression cases (harness, REIHE5 with `bekannt`, server test file) | – | test/qualitaet/faelle.ts, pruefen.ts, faelle-reihe5.ts, qualitaet.test.ts, apps/server/test/szenariotest.test.ts |
| 1 | Q1 | 0 | assistant.ts, adaptScenario.ts, briefings.ts, zuordnung.ts (1927–1960), validate.ts |
| 2 | Q2 | 0 | zuordnung.ts (500–1000, 2100–2260), thema.ts, situation.ts, differentiationMatrix.ts, adaptScenario.ts (508), briefings.ts (690–755) |
| 3 | Q3 | Q2 (goal reading decides which chain is assumed) | zuordnung.ts (1128–1212, 1311–1360, 1620–1720, 2270–2425), ranking.ts, regeln.ts, data/regeln.json |
| 4 | Q4 | Q3 (plans change, then the notes are compared) | regeln.ts (246–310, 359–400), zuordnung.ts (1927–1957), briefings.ts (757–870) |
| 5 | Q5 | Q4 | teilgruppen.ts, methodAdjustments.ts, adaptScenario.ts, entwurf.ts |
| 6 | Q6 | Q1 (table rows), Q3 (assumed goal kind) | assistant.ts, briefings.ts (191, 696), zuordnung.ts (2182–2204, 557–573, 1733, 1869), zielart.ts, entwurf.ts, data/regeln.json |
| parallel from step 0 | QD1 | – | no repo file |
| after Q3 and the gate | QD2 | QD1, Q3, Q4, Q5, Q6 (fields the data fills) | data/bausteine, data/vocab.json, data/ketten.json, data/teilgruppen.json |
| last | Q7 | all | reports |

**Same files, so not in parallel.** `zuordnung.ts` is touched by Q1, Q2, Q3, Q4 and Q6: these run one after another in the order above. `briefings.ts`: Q1, Q2, Q4, Q6. `assistant.ts`: Q1, Q6. `regeln.ts`: Q3, Q4. `adaptScenario.ts`: Q1, Q2, Q5. `data/regeln.json`: Q3, Q6. Q5 could run beside Q6 (different files except `entwurf.ts`); QD1 runs beside everything.

**Rulings to get before coding (ledger).** (1) Q4: rewrite of fixwelle-b.test.ts:29–34 and the list of rooms with Sicherheitsbezug (musikraum in or out). (2) Q4: Baukasten keeps its visible default groups or follows the API. (3) Q6: `/plan` keeps planning for requests without any frame and says so. (4) Q2: Projekttag = 270 min assumed. (5) Q3: one new built-in rule in `data/regeln.json` inside a code task.

## Rulings (controller, 2026-11-27)
1. Q4: fixwelle-b.test.ts:29–34 is rewritten where the behaviour changes on purpose; musikraum has no Sicherheitsbezug.
2. Q4: the Baukasten follows the API — no default groups that create Zusatzphasen without the user choosing them (Jan's Baukasten concept: no preselection).
3. Q6: /plan keeps planning without a frame and states the assumption.
4. Q2: Projekttag = 270 min (six lessons of 45 min), stated as assumption.
5. Q3: the new built-in rule in data/regeln.json ships inside Q3, Grundlage „Setzung“.
