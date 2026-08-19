import mongoose, { Schema, Document, models, model } from "mongoose";

export interface IImageSyncFailure extends Document {
  fileId: string;
  fileName: string;
  mimeType: string;
  parentFolderId?: string;

  operation: string;

  errorType: string;
  errorMessage: string;

  recoveryAttempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;

  status: "PENDING" | "PROCESSING" | "RESOLVED" | "NEEDS_REVIEW";
  lockedUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ImageSyncFailureSchema = new Schema<IImageSyncFailure>(
  {
    fileId: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    parentFolderId: {
      type: String,
      trim: true,
    },
    operation: {
      type: String,
      required: true,
      trim: true,
    },
    errorType: {
      type: String,
      required: true,
      trim: true,
    },
    errorMessage: {
      type: String,
      required: true,
      trim: true,
    },
    recoveryAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    nextRetryAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "RESOLVED", "NEEDS_REVIEW"],
      default: "PENDING",
      required: true,
    },
    lockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "image_sync_failures",
  }
);

// Unique compound index for exact logical failure
ImageSyncFailureSchema.index({ fileId: 1, operation: 1 }, { unique: true });

// Query index for the recovery cron
ImageSyncFailureSchema.index({ status: 1, nextRetryAt: 1 });

const ImageSyncFailure =
  (models.ImageSyncFailure as mongoose.Model<IImageSyncFailure>) ||
  model<IImageSyncFailure>("ImageSyncFailure", ImageSyncFailureSchema);

export default ImageSyncFailure;
