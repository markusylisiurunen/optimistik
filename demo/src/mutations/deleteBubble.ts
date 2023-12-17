import { createMutation } from "optimistik";

export type DeleteBubbleArgs = {
  id: string;
};
export const DeleteBubble = createMutation<DeleteBubbleArgs>("DeleteBubble", async (tx, { id }) => {
  await tx.del(`bubbles:${id}`);
});
