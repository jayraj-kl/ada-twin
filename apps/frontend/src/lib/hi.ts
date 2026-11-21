// Hindi for the app's English text, keyed by the English exactly as the code
// writes it. Digits stay 0-9. tests/frontend/i18n.test.ts checks that every
// text passed to t() has an entry here. Machine translation, to be reviewed
// by a native speaker.
import { PART1 } from "./hi/part1";
import { PART2 } from "./hi/part2";
import { PART3 } from "./hi/part3";
import { PART4 } from "./hi/part4";
import { PART5 } from "./hi/part5";
import { PART6 } from "./hi/part6";
import { PART7 } from "./hi/part7";

export const HI: Record<string, string> = {
  ...PART1,
  ...PART2,
  ...PART3,
  ...PART4,
  ...PART5,
  ...PART6,
  ...PART7,
};
