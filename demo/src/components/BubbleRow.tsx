import { Box, Flex, IconButton, Select, TextField } from "@radix-ui/themes";
import { X } from "lucide-react";
import React from "react";

type BubbleRowProps = {
  colors: { id: string; name: string; hex: string }[];
  colorID: string;
  size: "s" | "m" | "l";
  memo: string;
  onSetBubbleColorID?: (colorID: string) => void;
  onSetBubbleSize?: (size: "s" | "m" | "l") => void;
  onSetBubbleMemo?: (memo: string) => void;
  onDeleteBubble?: () => void;
};
const BubbleRow: React.FC<BubbleRowProps> = (props) => {
  const color = props.colors.find((color) => color.id === props.colorID);
  if (!color) {
    throw new Error("color not found");
  }
  return (
    <Flex align="center" gap="2">
      <Flex justify="center" style={{ width: "56px" }}>
        <Box
          style={{
            background: color.hex,
            borderRadius: "9999px",
            ...(props.size === "s"
              ? { width: "24px", height: "24px" }
              : props.size === "m"
                ? { width: "40px", height: "40px" }
                : props.size === "l"
                  ? { width: "56px", height: "56px" }
                  : null),
          }}
        />
      </Flex>
      <Select.Root
        value={props.colorID}
        onValueChange={(value) => {
          props.onSetBubbleColorID?.(value);
        }}
      >
        <Select.Trigger />
        <Select.Content>
          {props.colors.map((color) => (
            <Select.Item value={color.id} key={color.id}>
              {color.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Select.Root
        value={props.size}
        onValueChange={(value) => {
          if (value === "s" || value === "m" || value === "l") {
            props.onSetBubbleSize?.(value);
          }
        }}
      >
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="s">Small</Select.Item>
          <Select.Item value="m">Medium</Select.Item>
          <Select.Item value="l">Large</Select.Item>
        </Select.Content>
      </Select.Root>
      <Box grow="1">
        <TextField.Input
          value={props.memo}
          onChange={(event) => {
            props.onSetBubbleMemo?.(event.target.value);
          }}
        />
      </Box>
      <IconButton
        variant="surface"
        color="gray"
        onClick={() => {
          props.onDeleteBubble?.();
        }}
      >
        <X size="16" />
      </IconButton>
    </Flex>
  );
};

export default BubbleRow;
