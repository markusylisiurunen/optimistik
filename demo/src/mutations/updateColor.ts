import { createMutation } from "optimistik";

export type UpdateColorArgs = {
  id: string;
  hex?: string;
  name?: string;
};
export const UpdateColor = createMutation<UpdateColorArgs>(
  "UpdateColor",
  async (tx, { id, hex, name }) => {
    type Color = { name: string; hex: string };
    const color = await tx.get<Color>(`colors:${id}`);
    if (!color) return;
    await tx.set(`colors:${id}`, {
      id: id,
      hex: hex ?? color.hex,
      name: name ?? color.name,
    });
  },
);
