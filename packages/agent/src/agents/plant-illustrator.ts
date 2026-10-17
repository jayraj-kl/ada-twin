import { z } from "zod";
import type {
  EditImage,
  ImageEditReply,
  ImageTurn,
  InlineImage,
} from "../image-editor";
import { type AskModel, parseJsonReply } from "../model";

export interface IllustrationRequest {
  /** The photo as it is: a view cut out of the plant's panorama. */
  view: InlineImage;
  /** What sits in the middle of the view, e.g. "Gas valve train (1 unit)". */
  subject: string;
  /** The applied changes this view shows, one line each. */
  changes: string[];
  /** The model's last edit, to revise instead of starting again. */
  previous?: ImageTurn;
  /** What the user asked for before, oldest first. */
  notes?: string[];
  message: string;
}

const INSTRUCTION = [
  "You edit real photos of an industrial plant to show how it would look after a redesign.",
  "Keep the camera, perspective, lighting, colours and everything not asked about exactly as in the photo.",
  "New equipment matches what is already there in make, size, finish and wear, stands on the floor at a believable place, and is connected the way its neighbours are (pipes, cables, ducts).",
  "Never add text, labels, arrows or people. Answer with the edited image and one short sentence on what you changed.",
].join(" ");

/**
 * Draws the redesign into a photo of the plant, or revises an earlier
 * drawing. Each call is one image; ask several times for several to choose
 * from.
 */
export function illustrate(
  edit: EditImage,
  request: IllustrationRequest,
): Promise<ImageEditReply> {
  const { view, subject, changes, previous, notes = [], message } = request;
  const context = [
    `This photo shows ${subject} in the middle.`,
    changes.length > 0
      ? `The redesign makes these changes here:\n${changes.map((line) => `- ${line}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const contents: ImageTurn[] = previous
    ? [
        {
          role: "user",
          parts: [
            { inlineData: view },
            {
              text: [
                context,
                notes.length > 0
                  ? `Asked for so far:\n${notes.map((note) => `- ${note}`).join("\n")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
        previous,
        {
          role: "user",
          parts: [
            {
              text: `Change your last image: ${message}\nChange only that, and keep everything else in your last image the same.`,
            },
          ],
        },
      ]
    : [
        {
          role: "user",
          parts: [
            { inlineData: view },
            {
              text: `${context}\n\n${message}\nUsing the provided photo, change only what this asks for and keep everything else exactly the same.`,
            },
          ],
        },
      ];
  return edit({
    instruction: INSTRUCTION,
    contents,
    aspectRatio: "16:9",
    imageSize: "2K",
  });
}

const Verdict = z.object({
  outside: z.boolean().catch(false),
  note: z.string().default(""),
});

/**
 * Whether a request draws equipment the applied redesign does not have,
 * such as a fourth boiler when it added a third. Such images are still
 * drawn, but marked: the simulation has not measured them.
 */
export async function outsideRedesign(
  ask: AskModel,
  options: { changes: string[]; message: string },
): Promise<{ outside: boolean; note: string }> {
  const reply = await ask({
    instruction:
      "You check requests to edit a photo of a plant against the redesign that was simulated.",
    prompt: [
      "The redesign that was simulated and applied:",
      ...(options.changes.length > 0
        ? options.changes.map((line) => `- ${line}`)
        : ["- nothing"]),
      "",
      `The user asks the photo editor:\n"""\n${options.message.trim()}\n"""`,
      "",
      "Is the user asking to add, remove or resize equipment beyond the redesign? Looks (colour, position, wording of the scene, lighting) are not beyond it.",
      'Answer with JSON: {"outside": boolean, "note": string}. note is one short sentence naming what is beyond the redesign, or empty.',
    ].join("\n"),
  });
  return Verdict.parse(parseJsonReply(reply.text));
}
