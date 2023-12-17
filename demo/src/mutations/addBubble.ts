import { createMutation } from "optimistik";

export type AddBubbleArgs = {
  colorID: string;
  size: "s" | "m" | "l";
  memo: string;
};
export const AddBubble = createMutation<AddBubbleArgs>(
  "AddBubble",
  async (tx, { colorID, size, memo }) => {
    const id = crypto.randomUUID();
    await tx.set(`bubbles:${id}`, { id, colorID, size, memo });
  },
);
