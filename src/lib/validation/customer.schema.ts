import { z } from "zod";

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Customer name is required"),

  email: z
    .email("Invalid email address")
    .optional(),

  contactName: z
    .string()
    .trim()
    .min(1, "Contact name is required"),

  phone: z
    .string()
    .trim()
    .min(10, "Phone number is too short"),

  address: z
    .string()
    .trim()
    .min(1, "Address is required"),
});

export type CustomerFormData = z.infer<typeof customerSchema>;