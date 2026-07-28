import mongoose, { Schema, Document, model, models } from "mongoose";

export interface ISession {
  sessionId: string;
  refreshTokenHash: string;
  lastRefreshTokenHash: string | null;
  refreshTokenRotatedAt: Date | null;
  userAgent?: string;
  createdAt: Date;
}

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  role: "admin" | "employee";
  sessions: ISession[];
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    sessionId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true },
    lastRefreshTokenHash: { type: String, default: null },
    refreshTokenRotatedAt: { type: Date, default: null },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

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
    sessions: {
      type: [SessionSchema],
      default: [],
      select: false,
    },
  },
  { timestamps: true }
);

const User =
  (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);

export default User;