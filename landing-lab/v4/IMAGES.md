# Image slots, v4 (Dither Mono)

| Field | Value |
| --- | --- |
| File | `images/hero.png` |
| Aspect ratio | 4:5 |
| Pixel size | 1600 × 2000 |
| Position | Fills the right half of the first viewport edge to edge (`object-fit: cover`, `object-position: 70% 50%`); below 860px it sits under the headline at 4:5. The canvas voxel scatter samples colours from the image's left edge, so the voxels follow the real picture once it lands. The ADATWIN wordmark overlaps its bottom edge. |
| Current file | Flat fill `#2A2A2A`, generated with ffmpeg. Stand-in only. |
| Future subject | A dithered industrial press emerging from black, lit from the right, its left side breaking into pixel voxels that drift into the dark. |

Drop-in: overwrite `images/hero.png` at the same pixel size. No layout change needed. Record the image's origin or generation prompt with it.
