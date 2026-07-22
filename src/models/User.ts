import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  role: "admin" | "employee";
  refreshTokenHash: string | null;
  lastRefreshTokenHash: string | null;
  refreshTokenRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "employee"],
      default: "employee",
    },
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    lastRefreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    refreshTokenRotatedAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

const User =
  (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);

export default User;