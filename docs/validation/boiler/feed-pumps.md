# Feed pumps (Boiler room)

Machine `boiler-1` · count 2 · station · sample `boiler`. Method and source IDs: [../README.md](../README.md).

## Equipment class

**Boiler feedwater centrifugal pump**, motor driven. The closest class with public field data is S1 "Pump / Centrifugal" (H26-100), with sub-classes "Integral Drive" (H26-110) and "Without Drive" (H26-120). The parent class "Pump" (H26-000) also covers "Positive Displacement" (H26-200).

## What the sim uses today

| Parameter            | Value in the sample   | Where it comes from                                        |
| -------------------- | --------------------- | ---------------------------------------------------------- |
| `units`              | 2                     | `sample.ts` (user input)                                   |
| `cycleTime`          | 120 s per batch       | Hard-coded fallback, provenance `assumed`                  |
| `cycleTimeVariation` | 0.25                  | Hard-coded fallback, `assumed`                             |
| `mtbf`               | 4 h of working time   | Hard-coded fallback, `assumed`                             |
| `mttr`               | 20 min (0.33 h)       | Hard-coded fallback, `assumed`                             |
| `scrapRate`          | 0.01                  | Hard-coded fallback, `assumed`                             |
| Uptime (derived)     | 0.923; 0.908 at 34 °C | MTBF / (MTBF + MTTR), `capacity.ts`                        |

If the user adds a manufacturer and model or a pump manual, "Find its parameters" replaces these with values read from the document (provenance `doc`) or drafted by the web-researcher agent (provenance `web`, with URL, quote and `datasheet` or `typical`). Those values vary by run and are not fixed in code.

## Published baseline

S1 = TM 5-698-5, Appendix B, page B-9. MTBF and failure counts are over calendar time.

| Class (item)                  | Unit-years | Failures | MTBF (h)  | MTTR (h) | Inherent availability | Operational availability |
| ----------------------------- | ---------: | -------: | --------: | -------: | --------------------: | -----------------------: |
| Pump (H26-000)                |     1742.2 |       11 | 1,387,387 |     7.09 |           0.999994889 |              0.999826613 |
| Centrifugal (H26-100)         |     1376.8 |        8 | 1,507,638 |     6.75 |           0.999995523 |              0.999903450 |
| Integral Drive (H26-110)      |      665.5 |        5 | 1,166,025 |     7.40 |           0.999993654 |              0.999887429 |
| Without Drive (H26-120)       |      711.3 |        3 | 2,076,992 |     5.67 |           0.999997272 |              0.999909083 |
| Positive Displacement (H26-200) |    365.3 |        3 | 1,066,720 |     8.00 |           0.999992500 |              0.999537023 |

- **Cycle time / throughput:** not found in a verified source for a "batch".
- **OREDA** (S6) carries centrifugal pump data but is paywalled; no figure used.

## Comparison

| Parameter    | Sim                 | Baseline (centrifugal sub-classes)                                     | Status             |
| ------------ | ------------------- | ---------------------------------------------------------------------- | ------------------ |
| MTBF         | 4 h (working)       | 1,166,025–2,076,992 h calendar; ≈276,900–493,200 h at 0.237 duty (Derived) | outside range      |
| MTTR         | 0.33 h              | 5.67–7.40 h                                                            | outside range      |
| Availability | 0.923               | Ai 0.999993654–0.999997272                                             | outside range      |
| Cycle time   | 120 s per batch     | not found in a verified source                                         | not yet comparable |
| Cycle-time variation, scrap | 0.25, 0.01 | not found in a verified source                                  | not yet comparable |

The sim's 4 h MTBF means two failures per pump unit per shift. S1's centrifugal fleet logged 8 failures in 1,376.8 unit-years.

## Validation plan

1. **Parameter range check (published data).** Data: S1 B-9 rows above; OREDA centrifugal pump tables when licensed. Test: researched or default MTBF and MTTR for this machine, converted to an operating basis with the plant's own running hours, against the centrifugal sub-class range. Proposed acceptance: both inside the range spanned by H26-110 and H26-120, or a document (provenance `doc`) explains why not.
2. **Kernel check (no data needed).** Run one Feed pumps station alone, kept busy (input never starved, since wear accrues only while working), with one maintenance crew per unit so no repair waits, for a horizon of at least 1,000 × MTBF, using S1's centrifugal MTBF and MTTR. Test: simulated down share against MTTR / (MTBF + MTTR). Proposed acceptance: within ±10% of the analytic value.
3. **Wear-out shape (public real data).** Data: Bearings (IMS) and FEMTO Bearing run-to-failure sets (S9). Test: fit a Weibull to their times to failure and compare the shape with the kernel's fixed shape 2. Proposed acceptance: the fitted shape's 90% interval contains 2; if it does not, record that the kernel's wear-out shape is not supported for bearing-driven pump failures.
4. **Real plant data.** Data: two or more years of work orders for the plant's feed pumps (failure time, repair start and end) and running hours. Test: plant MTBF and MTTR against S1, then 60 days of the twin under standard rules against the plant's recorded pump downtime per shift. Proposed acceptance: the plant's observed down share per shift lies inside the 5th–95th percentile band of the 60 simulated days.
