import { createMutation } from "optimistik";

export type UpdateBubbleArgs = {
  id: string;
  colorID?: string;
  size?: "s" | "m" | "l";
  memo?: string;
};
export const UpdateBubble = createMutation<UpdateBubbleArgs>(
  "UpdateBubble",
  async (tx, { id, colorID, size, memo }) => {
    type Bubble = { colorID: string; size: "s" | "m" | "l"; memo: string };
    const bubble = await tx.get<Bubble>(`bubbles:${id}`);
    if (!bubble) return;
    await tx.set(`bubbles:${id}`, {
      id: id,
      colorID: colorID ?? bubble.colorID,
      size: size ?? bubble.size,
      memo: memo ?? bubble.memo,
    });
  },
);
