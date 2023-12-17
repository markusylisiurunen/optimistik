import { Box, Button, Flex, Heading, Select, TextField } from "@radix-ui/themes";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";

type AddBubbleFormProps = {
  colors: { id: string; name: string }[];
  onAddBubble?: (colorID: string, size: "s" | "m" | "l", memo: string) => void;
};
const AddBubbleForm: React.FC<AddBubbleFormProps> = (props) => {
  type Form = { colorID: string; size: "s" | "m" | "l"; memo: string };
  const { register, setValue, watch, handleSubmit } = useForm<Form>({
    defaultValues: { colorID: props.colors[0]?.id, size: "m" },
  });
  useEffect(() => {
    register("colorID", { required: true });
    register("size", { required: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Heading size="3" weight="medium" mt="4" mb="2">
        Add bubble
      </Heading>
      <Flex gap="2">
        <Select.Root
          value={watch("colorID")}
          onValueChange={(value) => {
            setValue("colorID", value);
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
          value={watch("size")}
          onValueChange={(value) => {
            setValue("size", value as "s" | "m" | "l");
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
            {...register("memo", { required: true })}
            placeholder="Jot some thoughts down..."
          />
        </Box>
        <Button
          onClick={handleSubmit(async (data) => {
            props.onAddBubble?.(data.colorID, data.size, data.memo);
          })}
        >
          Add bubble
        </Button>
      </Flex>
    </>
  );
};

export default AddBubbleForm;
