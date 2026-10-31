"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

// Submit button that asks for confirmation first. Without JS the form submits directly.
export function ConfirmSubmit({ message, ...props }: { message: string } & ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
