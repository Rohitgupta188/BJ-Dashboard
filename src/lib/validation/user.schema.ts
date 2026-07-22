import { z } from "zod";
import { emailSchema } from "./primitives";

const usernameField = z
  .string({
    error: (issue) =>
      issue.input === undefined ? "Username is required" : "Username must be a string",
  })
  .trim()
  .min(3, { error: "Username must be at least 3 characters" })
  .max(50, { error: "Username must be at most 50 characters" })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    error: "Username may only contain letters, numbers, underscores, and hyphens",
  });

const strongPasswordField = z
  .string({
    error: (issue) =>
      issue.input === undefined ? "Password is required" : "Password must be a string",
  })
  .min(6, { error: "Password must be at least 6 characters" })
  .max(50, { error: "Password is too long" })
  .regex(/[A-Z]/, { error: "Password must contain at least one uppercase letter" })
  .regex(/[a-z]/, { error: "Password must contain at least one lowercase letter" })
  .regex(/[0-9]/, { error: "Password must contain at least one number" })
  .regex(/[^A-Za-z0-9]/, {
    error: "Password must contain at least one special character",
  });

const registrationFields = {
  username: usernameField,
  email: emailSchema,
  password: strongPasswordField,
};

export const userRegistrationApiSchema = z.object(registrationFields);

export const userRegistrationSchema = z
  .object({
    ...registrationFields,
    confirmPassword: z.string({
      error: (issue) =>
        issue.input === undefined
          ? "Please confirm your password"
          : "Must be a string",
    }),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }
  });

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Password is required" : "Must be a string",
    })
    .min(1, { error: "Password is required" }),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z
      .string({ error: "Reset token is required" })
      .min(1, { error: "Reset token cannot be empty" }),
    newPassword: strongPasswordField,
    confirmNewPassword: z.string({
      error: "Please confirm your new password",
    }),
  })
  .superRefine(({ newPassword, confirmNewPassword }, ctx) => {
    if (newPassword !== confirmNewPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["confirmNewPassword"],
      });
    }
  });

export const updateUserProfileSchema = z
  .object({
    username: usernameField.optional(),
    email: emailSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.username && !data.email) {
      ctx.addIssue({
        code: "custom",
        message: "At least one field must be provided for update",
        path: [],
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Current password is required" })
      .min(1, { error: "Current password is required" }),
    newPassword: strongPasswordField,
    confirmNewPassword: z.string({
      error: "Please confirm your new password",
    }),
  })
  .superRefine(({ currentPassword, newPassword, confirmNewPassword }, ctx) => {
    if (currentPassword === newPassword) {
      ctx.addIssue({
        code: "custom",
        message: "New password must differ from the current password",
        path: ["newPassword"],
      });
    }
    if (newPassword !== confirmNewPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["confirmNewPassword"],
      });
    }
  });

export type UserRegistrationInput = Omit<
  z.infer<typeof userRegistrationSchema>,
  "confirmPassword"
>;

export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;