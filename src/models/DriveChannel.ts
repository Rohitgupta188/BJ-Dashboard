import mongoose, { Schema, models, model } from "mongoose";

export interface IDriveChannel {
  channelId: string;  // UUID we assigned when registering the channel
  resourceId: string; // Google's resource ID (required to stop the channel)
  pageToken: string;  // Latest drive.changes.list page token
  expiresAt: Date;    // When Google will stop sending notifications
  renewedAt?: Date;   // Last time we successfully renewed
}

const DriveChannelSchema = new Schema<IDriveChannel>(
  {
    channelId:  { type: String, required: true },
    resourceId: { type: String, required: true },
    pageToken:  { type: String, required: true },
    expiresAt:  { type: Date,   required: true },
    renewedAt:  { type: Date },
  },
  { timestamps: true, collection: "drive_channels" }
);

const DriveChannel =
  (models.DriveChannel as mongoose.Model<IDriveChannel>) ||
  model<IDriveChannel>("DriveChannel", DriveChannelSchema);

export default DriveChannel;
