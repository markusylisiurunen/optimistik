import { createMutation } from "optimistik";

export type SetSliderArgs = {
  value: number;
};
export const SetSlider = createMutation<SetSliderArgs>("SetSlider", async (tx, { value }) => {
  await tx.set(`slider`, value);
});
