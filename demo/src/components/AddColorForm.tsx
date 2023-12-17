import { Box, Button, Flex, Heading, TextField } from "@radix-ui/themes";
import React from "react";
import { useForm } from "react-hook-form";

type AddColorFormProps = {
  onAddColor?: (name: string, hex: string) => void;
};
const AddColorForm: React.FC<AddColorFormProps> = (props) => {
  const { register, handleSubmit } = useForm<{ name: string; hex: string }>();
  return (
    <>
      <Heading size="3" weight="medium" mt="4" mb="2">
        Add color
      </Heading>
      <Flex gap="2">
        <TextField.Input
          {...register("hex", { required: true, pattern: /^#[0-9a-f]{6}$/i })}
          placeholder="#ffd700"
        />
        <Box grow="1">
          <TextField.Input
            {...register("name", { required: true })}
            placeholder="Tangerine Tango"
          />
        </Box>
        <Button
          onClick={handleSubmit((data) => {
            props.onAddColor?.(data.name, data.hex);
          })}
        >
          Add color
        </Button>
      </Flex>
    </>
  );
};

export default AddColorForm;
