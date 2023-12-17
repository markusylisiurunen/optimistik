import { Box, Button, Card, Flex, Heading, Slider, Text } from "@radix-ui/themes";
import { Minus, Plus } from "lucide-react";
import { useQuery } from "optimistik";
import { useEffect, useState } from "react";
import AddBubbleForm from "./components/AddBubbleForm";
import AddColorForm from "./components/AddColorForm";
import BubbleRow from "./components/BubbleRow";
import Color from "./components/ColorRow";
import { useOptimistik } from "./components/Provider";
import { mutations } from "./mutations";

const CountCard: React.FC = () => {
  const optimistik = useOptimistik();
  const { loading, data: count } = useQuery(optimistik, async (tx) => {
    return (await tx.get<number>("count")) ?? 0;
  });
  if (loading) {
    return null;
  }
  return (
    <Card>
      <Heading weight="medium" mb="3">
        Count
      </Heading>
      <Flex direction="row" align="center" justify="center" gap="2">
        <Button
          variant="outline"
          onClick={() => {
            void optimistik.send(mutations.DecrementCount);
          }}
        >
          <Minus size="16" />
        </Button>
        <Box style={{ width: "40px", textAlign: "center" }}>
          <Text>{count}</Text>
        </Box>
        <Button
          variant="outline"
          onClick={() => {
            void optimistik.send(mutations.IncrementCount);
          }}
        >
          <Plus size="16" />
        </Button>
      </Flex>
    </Card>
  );
};

const SliderCard: React.FC = () => {
  const optimistik = useOptimistik();
  const { loading, data: slider } = useQuery(optimistik, async (tx) => {
    return (await tx.get<number>("slider")) ?? 0;
  });
  if (loading) {
    return null;
  }
  return (
    <Card>
      <Heading weight="medium" mb="3">
        Slider
      </Heading>
      <Slider
        value={[slider ?? 0]}
        onValueChange={(value) => {
          void optimistik.send(mutations.SetSlider, { value: value.at(0) ?? 0 });
        }}
      />
    </Card>
  );
};

const ColorsCard: React.FC = () => {
  const optimistik = useOptimistik();
  const { loading, data: colors } = useQuery(optimistik, async (tx) => {
    return tx.scan<{ id: string; hex: string; name: string }>("colors:.+");
  });
  if (loading) {
    return null;
  }
  return (
    <Card>
      <Heading weight="medium" mb="3">
        Colors
      </Heading>
      <Flex direction="column" gap="2">
        {[...(colors ?? [])]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ id, ...color }) => (
            <Color
              key={id}
              name={color.name}
              hex={color.hex}
              onSetColorHex={(hex) => {
                void optimistik.send(mutations.UpdateColor, { id, hex });
              }}
              onSetColorName={(name) => {
                void optimistik.send(mutations.UpdateColor, { id, name });
              }}
              onDeleteColor={() => {
                void optimistik.send(mutations.DeleteColor, { id });
              }}
            />
          ))}
      </Flex>
      <AddColorForm
        onAddColor={(name, hex) => {
          void optimistik.send(mutations.AddColor, { name, hex });
        }}
      />
    </Card>
  );
};

const BubblesCard: React.FC = () => {
  const optimistik = useOptimistik();
  const { loading: colorsLoading, data: colors } = useQuery(optimistik, async (tx) => {
    return tx.scan<{ id: string; name: string; hex: string }>("colors:.+");
  });
  const { loading: bubblesLoading, data: bubbles } = useQuery(optimistik, async (tx) => {
    type Bubble = { id: string; colorID: string; size: "s" | "m" | "l"; memo: string };
    return tx.scan<Bubble>("bubbles:.+");
  });
  if (colorsLoading || bubblesLoading) {
    return null;
  }
  return (
    <Card>
      <Heading weight="medium" mb="3">
        Bubbles
      </Heading>
      <Flex direction="column" gap="2">
        {[...(bubbles ?? [])].map(({ id, ...bubble }) => (
          <BubbleRow
            key={id}
            colors={[...(colors ?? [])]}
            colorID={bubble.colorID}
            size={bubble.size}
            memo={bubble.memo}
            onSetBubbleColorID={(colorID) => {
              void optimistik.send(mutations.UpdateBubble, { id, colorID });
            }}
            onSetBubbleSize={(size) => {
              void optimistik.send(mutations.UpdateBubble, { id, size });
            }}
            onSetBubbleMemo={(memo) => {
              void optimistik.send(mutations.UpdateBubble, { id, memo });
            }}
            onDeleteBubble={() => {
              void optimistik.send(mutations.DeleteBubble, { id });
            }}
          />
        ))}
      </Flex>
      <AddBubbleForm
        colors={[...(colors ?? [])]}
        onAddBubble={(colorID, size, memo) => {
          void optimistik.send(mutations.AddBubble, { colorID, size, memo });
        }}
      />
    </Card>
  );
};

const App: React.FC = () => {
  const optimistik = useOptimistik();
  const [ready, setIsReady] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      if (optimistik.state === "ready") {
        clearInterval(interval);
        setIsReady(true);
      }
    }, 100);
    return () => clearInterval(interval);
  });
  if (!ready) {
    return null;
  }
  return (
    <Box mx="auto" py="4" style={{ maxWidth: "640px" }}>
      <CountCard />
      <Box height="4" />
      <SliderCard />
      <Box height="4" />
      <ColorsCard />
      <Box height="4" />
      <BubblesCard />
    </Box>
  );
};

export default App;
