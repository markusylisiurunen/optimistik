import { Box, Flex, IconButton, TextField } from "@radix-ui/themes";
import { X } from "lucide-react";
import React from "react";

type ColorRowProps = {
  name: string;
  hex: string;
  onSetColorHex?: (hex: string) => void;
  onSetColorName?: (name: string) => void;
  onDeleteColor?: () => void;
};
const ColorRow: React.FC<ColorRowProps> = (props) => {
  return (
    <Flex align="center" gap="2">
      <Box
        width="6"
        height="6"
        style={{ background: props.hex, borderRadius: "var(--radius-2)" }}
      />
      <TextField.Input
        value={props.hex}
        onChange={(event) => {
          props.onSetColorHex?.(event.target.value);
        }}
      />
      <Box grow="1">
        <TextField.Input
          value={props.name}
          onChange={(event) => {
            props.onSetColorName?.(event.target.value);
          }}
        />
      </Box>
      <IconButton
        variant="surface"
        color="gray"
        onClick={() => {
          props.onDeleteColor?.();
        }}
      >
        <X size="16" />
      </IconButton>
    </Flex>
  );
};

export default ColorRow;
