import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  /** SHA-256 hash of the raw refresh token — never stored in plain text */
  refreshTokenHash: string | null;
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
    refreshTokenHash: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

const User =
  (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);

export default User;