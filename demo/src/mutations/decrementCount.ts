import { createMutation } from "optimistik";

export const DecrementCount = createMutation("DecrementCount", async (tx) => {
  const count = (await tx.get<number>("count")) ?? 0;
  await tx.set("count", Math.max(0, count - 1));
});
