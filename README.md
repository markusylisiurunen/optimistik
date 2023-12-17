# Optimistik

```tsx
import { Optimistik, createMutation, useQuery } from "optimistik";
import React from "react";

const optimistik = new Optimistik({ name: "demo" });

const Increment = createMutation("Increment", async (tx) => {
  const count = (await tx.get<number>("count")) ?? 0;
  await tx.set("count", count + 1);
});

const Decrement = createMutation("Decrement", async (tx) => {
  const count = (await tx.get<number>("count")) ?? 0;
  await tx.set("count", Math.max(0, count - 1));
});

const App: React.FC = () => {
  const { data: count } = useQuery(optimistik, async (tx) => {
    return (await tx.get<number>("count")) ?? 0;
  });
  return (
    <div>
      <button onClick={() => void optimistik.send(Decrement)}>Decrement</button>
      <span>{count}</span>
      <button onClick={() => void optimistik.send(Increment)}>Increment</button>
    </div>
  );
};

export default App;
```
