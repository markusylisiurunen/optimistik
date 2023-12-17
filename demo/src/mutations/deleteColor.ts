import { createMutation } from "optimistik";

export type DeleteColorArgs = {
  id: string;
};
export const DeleteColor = createMutation<DeleteColorArgs>("DeleteColor", async (tx, { id }) => {
  await tx.del(`colors:${id}`);
});
