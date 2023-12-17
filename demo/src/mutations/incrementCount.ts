import { createMutation } from "optimistik";

export const IncrementCount = createMutation("IncrementCount", async (tx) => {
  const count = (await tx.get<number>("count")) ?? 0;
  await tx.set("count", count + 1);
});
