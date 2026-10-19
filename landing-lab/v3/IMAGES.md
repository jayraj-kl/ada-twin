# Image slots, v3 (Vast Quiet Cinematic)

| Field | Value |
| --- | --- |
| File | `images/hero.png` |
| Aspect ratio | 16:10 |
| Pixel size | 2880 × 1800 |
| Position | Full-bleed behind the first viewport (`object-fit: cover`, `object-position: 50% 100%`). The upper half is the headline zone and must be pure fog white (`#EEF0EE`); the plant fills the lower half. |
| Current file | Two flat bands generated with ffmpeg: `#EEF0EE` over `#A9B0AD`, split at half height. Stand-in only. |
| Future subject | A vast desaturated aerial view of an industrial plant at dawn, the upper half pure fog white. |

Drop-in: overwrite `images/hero.png` at the same pixel size. No layout change needed. Record the image's origin or generation prompt with it.
