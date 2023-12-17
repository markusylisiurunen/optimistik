import { createMutation } from "optimistik";

export type AddColorArgs = {
  name: string;
  hex: string;
};
export const AddColor = createMutation<AddColorArgs>("AddColor", async (tx, { name, hex }) => {
  const id = crypto.randomUUID();
  await tx.set(`colors:${id}`, { id, name, hex });
});
