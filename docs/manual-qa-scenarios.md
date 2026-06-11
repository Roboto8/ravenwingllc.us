# Manual QA: Real-World Test Scenarios

Five realistic jobs to run through FenceTrace, with **real June-2026 retail
prices** (researched 2026-06-11: Home Depot national online prices,
cross-checked against Stine Home / Sutherlands live pages) and **hand-computed
expected counts** so you're checking the app against ground truth, not against
itself. Each scenario also exercises one of the 2026-06-11 fixes.

Trace real yards near you — your own street works. Your browser is already
excluded from analytics if you visited `?internal=1`.

## Step 0 — Load this price book

Account → Pricing → **Import (paste)** → paste the wood table below verbatim
(markdown and all — the parser reads it) → Apply. It should report
"Imported 10 prices". The chain-link/vinyl/labor lines further down paste the
same way as plain `key value` lines.

Wood (6 ft keys unless noted):

| Price-book field        | Real price | SKU basis                                   |
|-------------------------|-----------:|---------------------------------------------|
| wood.6.postCost         | 9.98       | 4x4x8 PT #2 GC (HD 194354)                  |
| wood.6.cornerPostCost   | 9.98       | same lumber — raise it if you'd brace        |
| wood.6.postCostGothic   | 26.99      | 4x4x8 French Gothic (Sutherlands 23168)      |
| wood.6.railCost         | 4.58       | 2x4x8 PT (HD 106147)                         |
| wood.6.railCost16       | 13.88      | 2x4x16 PT GC (Stine live price)              |
| wood.6.picketCost       | 2.38       | 5/8x5-1/2x6 dog-ear (HD 102560)              |
| wood.extra.bracketCost  | 0.98       | Simpson FB24Z                                |
| wood.extra.postCapCost  | 7.98       | ProWood Hampton flat cap                     |
| wood.extra.concreteBagCost | 7.97    | Quikrete 50 lb FAST-SET (see caveats)        |
| wood.extra.screwBoxCost | 10.97      | Deckmate 1 lb box (see caveats)              |

Chain-link (4 ft): linePostCost 19.97 · termPostCost 26.97 · fabricCost 109
· topRailCost **49.02** (app prices a 21-ft stick; retail is 10.5-ft @ 24.51 — enter 2×)
· tensionBarCost 5.97 · tensionBandCost 1.66 · braceBandCost 1.74
· railEndCost 2.54 · loopCapCost 2.40 · domeCapCost 1.97 · carriageBoltCost 0.50
· tieWireCost 0.13

Vinyl (6 ft): postCost 44.73 · panelCost 99.00 · postCapCost 8.39
(stiffener: no verified retail price — leave the default).

Labor & markup (mid-range VA, from 2025-26 cost guides): labor.default **15**/ft
· labor.gate **75** · markup.percent **10** · markup.jobMin **750**.
Extras: Old fence removal **4**/ft · Haul-away **300** flat.

---

## Scenario 1 — Straight-run wood privacy (the bread-and-butter job)

Trace a ~**152 ft** back-property line (2 points, no corners). Wood, 6 ft,
**2x4x16 rails**, flat post tops, Flat ground.

| Item                  | Expected qty | × price | Expected $ |
|-----------------------|-------------:|--------:|-----------:|
| 4x4x8 line posts      | 18           | 9.98    | 179.64     |
| 4x4x8 corner/end posts| 2            | 9.98    | 19.96      |
| 2x4x16 rails          | 29           | 13.88   | 402.52     |
| 6-ft pickets          | 323          | 2.38    | 768.74     |
| Rail brackets         | 114          | 0.98    | 111.72     |
| Post caps             | 20           | 7.98    | 159.60     |
| 50 lb concrete bags   | 40           | 7.97    | 318.80     |
| Screw boxes           | 22           | 10.97   | 241.34     |
| **Materials total**   |              |         | **≈ 2,202** |

With labor 15/ft + 10% markup: customer price ≈ **$4,700** → **$30.9/lf
installed**, square in the $25–50/lf guide band (Richmond VA $20–50).
**Flag if** the app lands below ~$22/lf or above ~$55/lf.

Verify: posts split into *line* and *corner/end* rows; an open 2-point run
shows exactly 2 corner/end.

## Scenario 2 — L-shaped yard, French Gothic (the corner-post test)

Trace ~**120 ft** as an L (3 points, one 90° corner). Wood 6 ft, 2x4x8 rails,
**French Gothic** post top.

Expected: 15 sections → 16 posts = **13 line + 3 corner/end** (2 ends + 1
corner — this is the count a veteran checks first). Gothic: **no post-caps
line**, posts priced 26.99. Pickets 255 · rails 45 · brackets 90 · concrete 32
· screw boxes 18. Materials ≈ 16×26.99 + 45×4.58 + 255×2.38 + 90×0.98 +
32×7.97 + 18×10.97 ≈ **$1,832**.

## Scenario 3 — Closed-loop chain-link (terminal-post math)

Trace a ~**200 ft closed rectangle** (4 points, close the loop). Chain-link,
4 ft.

Expected: 21 posts = **15 line + 6 terminal** (closed loop: 4 corners + the
2 baseline terminals; no "ends"). Fabric **4 rolls** · top rail **10**
21-ft-equivalent sticks · tension bars 6 · tension bands 18 · brace bands 12
· rail ends 6 · loop caps 15 · dome caps 6 · bolts 30 · tie wires 160 ·
concrete 42. Materials ≈ **$1,510** → with labor/markup lands ≈ $15–16/lf
installed (guide band $10–20 ✓).

## Scenario 4 — Vinyl on a slope (the terrain fix)

Trace ~**96 ft** straight run. Vinyl, 6 ft. Note the total with Ground =
Flat, then select **Slope (+15%)**.

Expected flat materials: posts 13×44.73 + panels 12×99 + caps 13×8.39 +
stiffeners 13×(default) + concrete 26×7.97 + screws 2 boxes ≈ **$2,430**.
**The total MUST increase ≈ $360 when Slope is selected** — this multiplier
was display-only until 2026-06-11; if the number doesn't move, the regression
is back. Verify the PDF shows a "Terrain (+15%)" line and its box still sums.

## Scenario 5 — The full money path (sell it to a fake customer)

Take Scenario 1's fence and add: 1 single gate, extras **Old fence removal**
(4/ft) + **Haul-away** (300), labor 15/ft, gate labor 75, markup 10%,
job minimum 750.

Walk the whole path and verify each:
1. Contractor panel: Customer Price = materials + gate + extras + labor
   (incl. gate labor) + markup; profit/margin shown.
2. **Manual BOM compare**: enter a "what I'd buy" list — `4x4x8 posts ×20`,
   `pickets ×300`, `concrete ×45` → expect match on posts (20 counted),
   pickets short 23, concrete over 5.
3. Save → reopen: totals identical (BOM overrides + custom items survive).
4. Send to Customer → open the link in a private window: items + quantities
   only, **no unit costs**, total = the full customer price from step 1,
   satellite disclaimer above the Approve button.
5. Customer PDF: no unit-cost columns, totals box sums to the same number.
6. Approve as the customer → approval records the amount; then change the
   fence and re-save → status drops back to "sent".
7. Tiny-job floor: new estimate, trace ~20 ft → price floors at the **$750
   job minimum** with the "Raised to…" note.

---

## Price caveats (honest sourcing)

- HD/Lowe's block automated fetching, so HD prices came from search-snippet
  capture cross-checked against two live-price retailers; where both agreed
  (posts, rails) confidence is high.
- The only 50 lb Quikrete is **fast-setting** ($7.97); regular mix is
  40/60/80 lb (60 lb ≈ $4.85). The app's 50 lb option models the fast-set bag
  installers actually use.
- Real Deckmate box is **73 screws**, app assumes 100/box — expect the app to
  show ~22 boxes where a contractor would buy ~30 lbs; tweak screwsPerBox
  thinking if it matters.
- Vinyl panel/post prices were derived from a card-promo display (+$25 added
  back) — believable, not list-verified.
- Installed-rate bands: wood $25–50/lf, chain-link $10–20/lf, vinyl $40–60/lf
  (2025-26 HomeGuide/Angi/Fixr; Richmond VA ranges bracket all midpoints).
  Labor should be 40–50% of installed price — outside 30–60% is suspect.
